import json
from pathlib import Path

import httpx

from scanner import konklancer_scan as ks

FIX = Path(__file__).parent / "fixtures"
SEL = {
    "item": ".project-item",
    "title": ".project-title",
    "summary": ".project-desc",
    "budget": ".budget",
    "bids": ".bids",
}


def test_parse_listing_extracts_and_resolves_links():
    html = (FIX / "listing_sample.html").read_text(encoding="utf-8")
    items = ks.parse_listing(html, "https://example.test/search", "demo", SEL)
    # آیتم بدون لینک نادیده گرفته می‌شود
    assert [p.title for p in items] == ["توسعه ربات تلگرام با پایتون", "ترجمه مقاله انگلیسی", "طراحی لوگو"]
    assert items[0].url == "https://example.test/project/101"
    assert items[0].budget_text == "حداکثر ۵۰۰ هزار تومان"
    assert items[0].bids_text == "۳ پیشنهاد"
    assert items[1].url == "https://example.org/project/102"


def test_ids_are_stable_and_unique():
    html = (FIX / "listing_sample.html").read_text(encoding="utf-8")
    a = ks.parse_listing(html, "https://example.test/", "demo", SEL)
    b = ks.parse_listing(html, "https://example.test/", "demo", SEL)
    assert [p.id for p in a] == [p.id for p in b]
    assert len({p.id for p in a}) == len(a)


def test_telegram_preview_parsing():
    html = (FIX / "telegram_preview.html").read_text(encoding="utf-8")
    items = ks.parse_telegram_preview(html, "chan")
    assert len(items) == 1  # پست دوم لینک تاریخ ندارد و کنار گذاشته می‌شود
    assert items[0].url == "https://t.me/chan/10"
    assert items[0].title.startswith("پروژه جدید")
    assert items[0].posted_text == "2026-10-09T10:00:00+00:00"


def test_include_exclude_filters():
    p = ks.Project(id="x", source="s", title="ربات Python", url="u", summary="")
    assert ks.matches(p, ["python"], [])
    assert not ks.matches(p, ["java"], [])
    assert not ks.matches(p, [], ["ربات"])


def test_dedupe_on_append(tmp_path):
    out = tmp_path / "p.jsonl"
    p = ks.Project(id="abc", source="s", title="t", url="u")
    assert ks.append_projects(out, [p]) == 1
    assert ks.append_projects(out, [p]) == 0
    assert len(out.read_text(encoding="utf-8").splitlines()) == 1


def test_redirect_outside_allowed_domain_is_blocked():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(404)
        # ریدایرکت به دامنه‌ی تبلیغاتی
        return httpx.Response(302, headers={"Location": "https://spam.example.net/"}) if request.url.host == "good.example" else httpx.Response(200, text="spam")

    with ks.make_client(httpx.MockTransport(handler)) as client:
        robots = ks.RobotsCache(client)
        limiter = ks.RateLimiter(0)
        try:
            ks.fetch_html(client, robots, limiter, "https://good.example/list", "good.example")
        except RuntimeError as e:
            assert "spam.example.net" in str(e)
        else:
            raise AssertionError("باید متوقف می‌شد")


def test_robots_disallow_is_respected():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(200, text="User-agent: *\nDisallow: /private/\n")
        return httpx.Response(200, text="ok")

    with ks.make_client(httpx.MockTransport(handler)) as client:
        robots = ks.RobotsCache(client)
        assert robots.allowed("https://site.example/list")
        assert not robots.allowed("https://site.example/private/x")


def test_robots_server_error_blocks_everything():
    def handler(request: httpx.Request) -> httpx.Response:
        if request.url.path == "/robots.txt":
            return httpx.Response(503)
        return httpx.Response(200)

    with ks.make_client(httpx.MockTransport(handler)) as client:
        assert not ks.RobotsCache(client).allowed("https://down.example/list")


def test_page_url_template():
    assert ks.page_url("https://a.test/x/{page}", 3) == "https://a.test/x/3"
    assert ks.page_url("https://a.test/list", 1) == "https://a.test/list"
    assert ks.page_url("https://a.test/list", 2) == "https://a.test/list?page=2"


def test_registry_is_valid_json_and_no_platform_scans_by_default():
    reg = json.loads(ks.REGISTRY_PATH.read_text(encoding="utf-8"))
    ids = [p["id"] for p in reg["platforms"]]
    assert len(ids) == len(set(ids))
    assert all(p["scan_enabled"] is False for p in reg["platforms"])
    lancerify = next(p for p in reg["platforms"] if p["id"] == "lancerify")
    assert lancerify["status"] == "active_flagged"


def test_cli_parse_file_filters_on_comma_separated_keywords(capsys):
    rc = ks.main([
        "parse-file", "--platform", "parscoders",
        "--html", str(FIX / "listing_sample.html"),
        "--selectors-json", json.dumps({"item": ".project-item", "title": ".project-title", "summary": ".project-desc"}),
        "--include", "پایتون,python",
    ])
    out = capsys.readouterr().out
    assert rc == 0
    assert "توسعه ربات تلگرام با پایتون" in out
    assert "ترجمه مقاله" not in out
    assert "3 مورد تجزیه شد، 1 مورد پس از فیلتر" in out
