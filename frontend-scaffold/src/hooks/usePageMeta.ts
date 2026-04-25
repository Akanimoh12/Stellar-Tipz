import { useEffect } from 'react';

interface PageMeta {
  title: string;
  description?: string;
  ogImage?: string;
  ogUrl?: string;
  twitterCard?: 'summary' | 'summary_large_image';
}

const DEFAULT_TITLE = 'Stellar Tipz';
const DEFAULT_DESCRIPTION = 'Empowering creators through decentralized, instant, and fair tipping on Stellar Blockchain';
const DEFAULT_OG_IMAGE = '/og-image.png';

/**
 * Hook to update page meta tags dynamically for SEO and social sharing.
 * 
 * @example
 * usePageMeta({
 *   title: 'Tip @alice',
 *   description: 'Send a tip to alice on Stellar Tipz',
 *   ogImage: '/og-image-alice.png',
 * });
 */
export function usePageMeta(meta: PageMeta) {
  useEffect(() => {
    // Update document title
    const fullTitle = meta.title ? `${meta.title} | ${DEFAULT_TITLE}` : DEFAULT_TITLE;
    document.title = fullTitle;

    // Helper to update or create meta tag
    const updateMetaTag = (selector: string, content: string, attr: string = 'content') => {
      let element = document.querySelector(selector) as HTMLMetaElement | null;
      if (!element) {
        // Create the element if it doesn't exist
        const match = selector.match(/\[([a-z-]+)="([^"]+)"\]/);
        if (match) {
          const [, attrName, attrValue] = match;
          element = document.createElement('meta');
          element.setAttribute(attrName, attrValue);
          document.head.appendChild(element);
        }
      }
      if (element) {
        element.setAttribute(attr, content);
      }
    };

    // Update description
    const description = meta.description || DEFAULT_DESCRIPTION;
    updateMetaTag('meta[name="description"]', description);
    updateMetaTag('meta[property="og:description"]', description);
    updateMetaTag('meta[name="twitter:description"]', description);

    // Update OG title
    updateMetaTag('meta[property="og:title"]', fullTitle);
    updateMetaTag('meta[name="twitter:title"]', fullTitle);

    // Update OG image
    const ogImage = meta.ogImage || DEFAULT_OG_IMAGE;
    updateMetaTag('meta[property="og:image"]', ogImage);
    updateMetaTag('meta[name="twitter:image"]', ogImage);

    // Update OG URL if provided
    if (meta.ogUrl) {
      updateMetaTag('meta[property="og:url"]', meta.ogUrl);
    }

    // Update Twitter card type
    const twitterCard = meta.twitterCard || 'summary_large_image';
    updateMetaTag('meta[name="twitter:card"]', twitterCard);

  }, [meta.title, meta.description, meta.ogImage, meta.ogUrl, meta.twitterCard]);
}

/**
 * Hook specifically for updating just the page title.
 * Maintains backward compatibility with existing usePageTitle usage.
 */
export function usePageTitle(title: string) {
  usePageMeta({ title });
}
