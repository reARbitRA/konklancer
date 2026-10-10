"""
konklancer scanner — جمع‌آوری فقط‌خواندنی پروژه‌ها از صفحات عمومی لیست پروژه.

آنچه این ابزار انجام می‌دهد:
  * خواندن صفحات عمومی فهرست پروژه (و پیش‌نمایش عمومی کانال‌های تلگرام)
  * رعایت robots.txt هر سایت و محدودیت نرخ درخواست (پیش‌فرض: هر ۸ ثانیه برای هر میزبان)
  * اگر سایت به دامنه دیگری ریدایرکت کند، درخواست را متوقف می‌کند
  * ذخیره پروژه‌ها در JSONL بدون تکرار

آنچه عمداً انجام نمی‌دهد:
  * ارسال پیشنهاد یا هر فرم/POST
  * ورود به حساب کاربری، استفاده از کوکی یا مرورگر شخصی
  * دور زدن کپچا، ضدربات یا محدودیت‌های سایت
  * تحویل خودکار کار به کارفرما یا انتشار خودکار کد

استفاده (از ریشه مخزن):
  python -m scanner.konklancer_scan list
  python -m scanner.konklancer_scan snapshot --platform parscoders      # ذخیره یک صفحه برای کالیبره کردن انتخابگرها
  python -m scanner.konklancer_scan scan --platform parscoders --pages 2 --include پایتون,python
  python -m scanner.konklancer_scan scan --telegram --include پایتون
  python -m scanner.konklancer_scan parse-file --platform parscoders --html scanner/tests/fixtures/listing_sample.html
"""

from __future__ import annotations

import argparse
import hashlib
import json
import sys
import time
import urllib.robotparser
from dataclasses import asdict, dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Iterable
from urllib.parse import urljoin, urlparse

import httpx
from bs4 import BeautifulSoup

HERE = Path(__file__).resolve().parent
REGISTRY_PATH = HERE / "platforms.json"
TELEGRAM_PATH = HERE / "telegram_sources.json"
DEFAULT_OUT = HERE / "out" / "projects.jsonl"
SNAPSHOT_DIR = HERE / "out" / "snapshots"

USER_AGENT = "konklancer-scanner/0.1 (read-only public listing reader)"


# ---------------------------------------------------------------------------
# مدل داده
# ---------------------------------------------------------------------------
@dataclass
class Project:
    id: str
    source: str
    title: str
    url: str
    summary: str = ""
    budget_text: str = ""
    bids_text: str = ""
    posted_text: str = ""
    scraped_at: str = ""


def _now() -> str:
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def _make_id(source: str, url: str) -> str:
    return hashlib.sha1(f"{source}|{url}".encode("utf-8")).hexdigest()[:16]


def _text(el) -> str:
    if el is None:
        return ""
    return " ".join(el.get_text(" ", strip=True).split())


# ---------------------------------------------------------------------------
# محدودیت نرخ و robots.txt
# ---------------------------------------------------------------------------
class RateLimiter:
    def __init__(self, delay_seconds: float):
        self.delay = delay_seconds
        self._last: dict[str, float] = {}

    def wait(self, host: str) -> None:
        last = self._last.get(host)
        if last is not None:
            gap = self.delay - (time.monotonic() - last)
            if gap > 0:
                time.sleep(gap)
        self._last[host] = time.monotonic()


class RobotsCache:
    """robots.txt هر میزبان را یک‌بار می‌خواند.

    طبق RFC 9309: 4xx یعنی «بدون محدودیت»، 5xx یا خطای شبکه یعنی «همه‌چیز ممنوع».
    توجه: stdlib از wildcard در robots (مثل /api*) پشتیبانی کامل ندارد؛
    برای مسیرهای مشکوک، بررسی دستی robots.txt را فراموش نکنید.
    """

    def __init__(self, client: httpx.Client):
        self.client = client
        self._rules: dict[str, urllib.robotparser.RobotFileParser | None] = {}

    def allowed(self, url: str) -> bool:
        parsed = urlparse(url)
        host = parsed.netloc
        if host not in self._rules:
            self._rules[host] = self._load(f"{parsed.scheme}://{host}/robots.txt")
        rules = self._rules[host]
        if rules is None:
            return False
        return rules.can_fetch(USER_AGENT, url)

    def _load(self, robots_url: str) -> urllib.robotparser.RobotFileParser | None:
        rp = urllib.robotparser.RobotFileParser()
        try:
            resp = self.client.get(robots_url, timeout=15)
        except httpx.HTTPError:
            return None
        if resp.status_code >= 500:
            return None
        if resp.status_code >= 400:
            rp.parse([])
            return rp
        rp.parse(resp.text.splitlines())
        return rp


# ---------------------------------------------------------------------------
# واکشی امن
# ---------------------------------------------------------------------------
def make_client(transport: httpx.BaseTransport | None = None) -> httpx.Client:
    return httpx.Client(
        headers={"User-Agent": USER_AGENT, "Accept-Language": "fa,en;q=0.8"},
        timeout=20,
        follow_redirects=True,
        transport=transport,
    )


def fetch_html(
    client: httpx.Client,
    robots: RobotsCache,
    limiter: RateLimiter,
    url: str,
    allowed_domain: str,
) -> str:
    if not robots.allowed(url):
        raise PermissionError(f"robots.txt این مسیر را ممنوع کرده است: {url}")
    host = urlparse(url).netloc
    limiter.wait(host)
    resp = client.get(url)
    final_host = urlparse(str(resp.url)).netloc
    if not _same_domain(final_host, allowed_domain):
        raise RuntimeError(
            f"ریدایرکت به دامنه خارج از فهرست: {final_host} (انتظار: {allowed_domain}). درخواست متوقف شد."
        )
    resp.raise_for_status()
    return resp.text


def _same_domain(host: str, domain: str) -> bool:
    return host == domain or host.endswith("." + domain)


# ---------------------------------------------------------------------------
# تجزیه‌گرها
# ---------------------------------------------------------------------------
def parse_listing(html: str, base_url: str, source: str, selectors: dict) -> list[Project]:
    """تجزیه‌گر عمومی بر اساس انتخابگرهای CSS که در platforms.json ثبت می‌شوند.

    کلیدهای الزامی: item, title. اختیاری: link, summary, budget, bids, posted.
    """
    soup = BeautifulSoup(html, "html.parser")
    projects: list[Project] = []
    for item in soup.select(selectors["item"]):
        title_el = item.select_one(selectors["title"])
        if selectors.get("link"):
            link_el = item.select_one(selectors["link"])
        else:
            link_el = title_el if (title_el is not None and title_el.name == "a") else item.select_one("a[href]")
        title = _text(title_el)
        href = link_el.get("href") if link_el is not None else None
        if not title or not href:
            continue
        url = urljoin(base_url, href)
        projects.append(
            Project(
                id=_make_id(source, url),
                source=source,
                title=title,
                url=url,
                summary=_text(item.select_one(selectors["summary"])) if selectors.get("summary") else "",
                budget_text=_text(item.select_one(selectors["budget"])) if selectors.get("budget") else "",
                bids_text=_text(item.select_one(selectors["bids"])) if selectors.get("bids") else "",
                posted_text=_text(item.select_one(selectors["posted"])) if selectors.get("posted") else "",
                scraped_at=_now(),
            )
        )
    return projects


def parse_telegram_preview(html: str, username: str) -> list[Project]:
    """پیش‌نمایش عمومی t.me/s/<username>: هر پست یک پروژه‌ی احتمالی است."""
    source = f"telegram:{username}"
    soup = BeautifulSoup(html, "html.parser")
    projects: list[Project] = []
    for msg in soup.select("div.tgme_widget_message"):
        text_el = msg.select_one(".tgme_widget_message_text")
        date_link = msg.select_one("a.tgme_widget_message_date")
        if text_el is None or date_link is None or not date_link.get("href"):
            continue
        body = text_el.get_text("\n", strip=True)
        if not body:
            continue
        time_el = msg.select_one("time")
        url = date_link["href"]
        projects.append(
            Project(
                id=_make_id(source, url),
                source=source,
                title=body.splitlines()[0][:200],
                url=url,
                summary=body[:1000],
                posted_text=time_el.get("datetime", "") if time_el is not None else "",
                scraped_at=_now(),
            )
        )
    return projects


# ---------------------------------------------------------------------------
# فیلتر، ذخیره و ثبت
# ---------------------------------------------------------------------------
def matches(project: Project, include: Iterable[str], exclude: Iterable[str]) -> bool:
    blob = f"{project.title} {project.summary}".lower()
    if any(x.lower() in blob for x in exclude if x):
        return False
    include = [x for x in include if x]
    if include and not any(x.lower() in blob for x in include):
        return False
    return True


def load_seen_ids(path: Path) -> set[str]:
    if not path.exists():
        return set()
    seen = set()
    with path.open(encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if line:
                seen.add(json.loads(line)["id"])
    return seen


def append_projects(path: Path, projects: list[Project]) -> int:
    path.parent.mkdir(parents=True, exist_ok=True)
    seen = load_seen_ids(path)
    new = [p for p in projects if p.id not in seen]
    with path.open("a", encoding="utf-8") as f:
        for p in new:
            f.write(json.dumps(asdict(p), ensure_ascii=False) + "\n")
    return len(new)


def load_registry() -> dict:
    return json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))


def get_platform(registry: dict, key: str) -> dict:
    for p in registry["platforms"]:
        if p["id"] == key:
            return p
    raise SystemExit(f"پلتفرم ناشناخته: {key}")


def page_url(template: str, page: int) -> str:
    if "{page}" in template:
        return template.format(page=page)
    if page == 1:
        return template
    sep = "&" if "?" in template else "?"
    return f"{template}{sep}page={page}"


# ---------------------------------------------------------------------------
# فرمان‌ها
# ---------------------------------------------------------------------------
def cmd_list(_args) -> int:
    reg = load_registry()
    for p in reg["platforms"]:
        scan = "فعال" if p.get("scan_enabled") and p.get("scan_selectors") else "غیرفعال"
        print(f"{p['id']:<16} {p['status']:<16} اسکن: {scan}")
    return 0


def cmd_snapshot(args) -> int:
    """یک صفحه‌ی لیست را برای کالیبره کردن انتخابگرها ذخیره می‌کند (فقط یک درخواست)."""
    reg = load_registry()
    plat = get_platform(reg, args.platform)
    if not plat.get("listing_url"):
        raise SystemExit("این پلتفرم listing_url ندارد.")
    url = page_url(plat["listing_url"], 1)
    with make_client() as client:
        html = fetch_html(client, RobotsCache(client), RateLimiter(args.delay), url, plat["domain"])
    SNAPSHOT_DIR.mkdir(parents=True, exist_ok=True)
    out = SNAPSHOT_DIR / f"{plat['id']}.html"
    out.write_text(html, encoding="utf-8")
    print(f"ذخیره شد: {out} ({len(html)} کاراکتر). انتخابگرها را از روی آن تنظیم کنید.")
    return 0


def cmd_parse_file(args) -> int:
    reg = load_registry()
    plat = get_platform(reg, args.platform)
    html = Path(args.html).read_text(encoding="utf-8")
    selectors = json.loads(args.selectors_json) if args.selectors_json else plat.get("scan_selectors")
    if not selectors:
        raise SystemExit("انتخابگرها تعریف نشده‌اند؛ --selectors-json بدهید یا scan_selectors را در platforms.json ثبت کنید.")
    base = plat.get("listing_url") or f"https://{plat['domain']}/"
    projects = parse_listing(html, base, plat["id"], selectors)
    include = [x.strip() for x in args.include.split(",") if x.strip()]
    exclude = [x.strip() for x in args.exclude.split(",") if x.strip()]
    kept = [p for p in projects if matches(p, include, exclude)]
    for p in kept:
        print(f"- {p.title}  ->  {p.url}")
    print(f"{len(projects)} مورد تجزیه شد، {len(kept)} مورد پس از فیلتر.")
    return 0


def cmd_scan(args) -> int:
    include = args.include.split(",") if args.include else []
    exclude = args.exclude.split(",") if args.exclude else []
    collected: list[Project] = []
    with make_client() as client:
        robots = RobotsCache(client)
        limiter = RateLimiter(args.delay)

        if args.platform:
            reg = load_registry()
            plat = get_platform(reg, args.platform)
            if not (plat.get("scan_enabled") and plat.get("scan_selectors")):
                raise SystemExit(
                    f"{plat['id']} هنوز برای اسکن فعال نشده است. "
                    "ابتدا snapshot بگیرید، انتخابگرها را در platforms.json ثبت کنید و scan_enabled را true کنید."
                )
            for n in range(1, args.pages + 1):
                url = page_url(plat["listing_url"], n)
                try:
                    html = fetch_html(client, robots, limiter, url, plat["domain"])
                except (PermissionError, RuntimeError, httpx.HTTPError) as e:
                    print(f"[توقف] {plat['id']} صفحه {n}: {e}", file=sys.stderr)
                    break
                collected += parse_listing(html, url, plat["id"], plat["scan_selectors"])

        if args.telegram:
            tg = json.loads(TELEGRAM_PATH.read_text(encoding="utf-8"))
            for ch in tg["channels"]:
                if not ch.get("scan_enabled"):
                    continue
                url = f"https://t.me/s/{ch['username']}"
                try:
                    html = fetch_html(client, robots, limiter, url, "t.me")
                except (PermissionError, RuntimeError, httpx.HTTPError) as e:
                    print(f"[توقف] @{ch['username']}: {e}", file=sys.stderr)
                    continue
                collected += parse_telegram_preview(html, ch["username"])

    kept = [p for p in collected if matches(p, include, exclude)]
    added = append_projects(Path(args.out), kept)
    print(f"{len(collected)} مورد خوانده شد؛ {len(kept)} پس از فیلتر؛ {added} مورد جدید در {args.out}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    ap = argparse.ArgumentParser(description="konklancer read-only project scanner")
    sub = ap.add_subparsers(dest="cmd", required=True)

    sub.add_parser("list", help="نمایش وضعیت پلتفرم‌ها").set_defaults(fn=cmd_list)

    s = sub.add_parser("snapshot", help="ذخیره یک صفحه لیست برای کالیبره کردن")
    s.add_argument("--platform", required=True)
    s.add_argument("--delay", type=float, default=8.0)
    s.set_defaults(fn=cmd_snapshot)

    p = sub.add_parser("parse-file", help="تجزیه یک فایل HTML محلی (تست آفلاین)")
    p.add_argument("--platform", required=True)
    p.add_argument("--html", required=True)
    p.add_argument("--selectors-json", default="", help="انتخابگرها به‌صورت JSON (اختیاری)")
    p.add_argument("--include", default="")
    p.add_argument("--exclude", default="")
    p.set_defaults(fn=cmd_parse_file)

    sc = sub.add_parser("scan", help="اسکن صفحات عمومی")
    sc.add_argument("--platform", default="")
    sc.add_argument("--telegram", action="store_true", help="کانال‌هایی که scan_enabled=true دارند")
    sc.add_argument("--pages", type=int, default=1)
    sc.add_argument("--delay", type=float, default=8.0)
    sc.add_argument("--include", default="", help="کلیدواژه‌ها با کاما")
    sc.add_argument("--exclude", default="", help="کلیدواژه‌ها با کاما")
    sc.add_argument("--out", default=str(DEFAULT_OUT))
    sc.set_defaults(fn=cmd_scan)
    return ap


def main(argv: list[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    return args.fn(args)


if __name__ == "__main__":
    raise SystemExit(main())
