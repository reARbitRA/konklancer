import { JobCategoryTag } from '../types';

/**
 * Helper function that uses the Gemini API to automatically categorize
 * incoming job descriptions into 'Frontend', 'Backend', 'DevOps', or 'Design' tags upon receipt.
 *
 * @param title The title of the incoming freelance job
 * @param description The detailed description of the job
 * @returns Promise resolving to 'Frontend' | 'Backend' | 'DevOps' | 'Design'
 */
export async function categorizeJobWithGemini(
  title: string,
  description: string
): Promise<JobCategoryTag> {
  const cleanTitle = (title || '').trim();
  const cleanDesc = (description || '').trim();

  // 1. Attempt API categorization via Gemini backend proxy
  try {
    const response = await fetch('/api/categorize-job', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: cleanTitle,
        description: cleanDesc,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      if (
        data &&
        data.tag &&
        ['Frontend', 'Backend', 'DevOps', 'Design'].includes(data.tag)
      ) {
        return data.tag as JobCategoryTag;
      }
    }
  } catch (error) {
    console.warn('[Gemini Categorizer] Server API request failed, executing heuristic categorization fallback:', error);
  }

  // 2. High-precision rule-based heuristic fallback if network/API is offline
  const combined = `${cleanTitle} ${cleanDesc}`.toLowerCase();

  // DevOps patterns
  if (
    /devops|docker|داکر|kubernetes|کوبرنتیز|ci\/cd|github actions|nginx|ان‌جینکس|linux|لینوکس|ubuntu|اوبونتو|server setup|کانفیگ سرور|ssh|ansible|terraform/i.test(
      combined
    )
  ) {
    return 'DevOps';
  }

  // Design patterns
  if (
    /design|طراحی|figma|فیگما|photoshop|فتوشاپ|ui\/ux|گرافیک|بنر|لوگو|vector|طراحی لوگو|ایلاستریتور|illustrator/i.test(
      combined
    )
  ) {
    return 'Design';
  }

  // Frontend patterns
  if (
    /frontend|فرانت|react|ری‌اکت|vue|ویو|next\.js|نکست|angular|html|css|tailwind|تیلویند|جاوااسکریپت|javascript|typescript|تایپ‌اسکریپت|داشبورد فروش|پنل ادمین|ریسپانسیو/i.test(
      combined
    )
  ) {
    return 'Frontend';
  }

  // Backend / Automation / Python default
  return 'Backend';
}
