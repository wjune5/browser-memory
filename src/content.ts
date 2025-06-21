/// <reference types="chrome"/>
import type {
  ExtractContentMessage,
  ExtractedContent,
  HighlightTextMessage,
  PageImage,
  PageLink,
  PageMetadata,
  ScrollToElementMessage
} from "./types/memory";

// Content script for Browser AI Memory extension
// Runs on all web pages to extract content and interact with the page

(function () {
  "use strict";

  // Listen for messages from popup and background scripts
  chrome.runtime.onMessage.addListener(
    (
      request:
        | ExtractContentMessage
        | HighlightTextMessage
        | ScrollToElementMessage,
      sender: chrome.runtime.MessageSender,
      sendResponse: (response?: any) => void
    ) => {
      try {
        switch (request.action) {
          case "extractContent":
            const extractRequest = request as ExtractContentMessage;
            const content = extractPageContent(extractRequest.includeSelection);
            sendResponse(content);
            break;

          case "highlightText":
            const highlightRequest = request as HighlightTextMessage;
            highlightText(highlightRequest.text);
            sendResponse({ success: true });
            break;

          case "scrollToElement":
            const scrollRequest = request as ScrollToElementMessage;
            scrollToElement(scrollRequest.selector);
            sendResponse({ success: true });
            break;

          default:
            console.warn("Unknown action:", (request as any).action);
            sendResponse({ error: "Unknown action" });
        }
      } catch (error) {
        console.error("Content script error:", error);
        sendResponse({
          error: error instanceof Error ? error.message : "Unknown error",
          content: document.title || "Error extracting content"
        });
      }

      return true; // Keep message channel open for async response
    }
  );

  // Extract meaningful content from the page
  function extractPageContent(includeSelection = false): ExtractedContent {
    try {
      const content: ExtractedContent = {
        title: document.title,
        url: window.location.href,
        domain: window.location.hostname,
        timestamp: new Date().toISOString(),
        content: "",
        metadata: {},
        links: [],
        images: []
      };

      // Get selected text if requested
      if (includeSelection) {
        const selection = window.getSelection();
        content.selectedText = selection?.toString().trim() || "";
      }

      // Extract main content
      content.content = extractMainContent();

      // Extract metadata
      content.metadata = extractMetadata();

      // Extract links
      content.links = extractLinks();

      // Extract images
      content.images = extractImages();

      return content;
    } catch (error) {
      console.error("Error extracting page content:", error);
      return {
        title: document.title || "Unknown",
        url: window.location.href,
        domain: window.location.hostname,
        timestamp: new Date().toISOString(),
        content: "Failed to extract content",
        metadata: {},
        links: [],
        images: []
      };
    }
  }

  // Extract the main textual content from the page
  function extractMainContent(): string {
    // Try to find main content area
    const contentSelectors = [
      "main",
      '[role="main"]',
      ".main-content",
      ".content",
      ".post-content",
      ".entry-content",
      ".article-content",
      "article",
      ".container"
    ];

    let mainElement: Element | null = null;
    for (const selector of contentSelectors) {
      const element = document.querySelector(selector);
      if (element) {
        mainElement = element;
        break;
      }
    }

    // Fallback to body if no main content found
    if (!mainElement) {
      mainElement = document.body;
    }

    // Extract text while preserving some structure
    const textContent = extractTextWithStructure(mainElement);

    // Clean and limit the content
    return cleanText(textContent).substring(0, 5000); // Limit to 5000 chars
  }

  // Extract text while preserving some structure
  function extractTextWithStructure(element: Element | null): string {
    if (!element) return "";

    // Skip script, style, and other non-content elements
    const skipTags = new Set([
      "script",
      "style",
      "nav",
      "header",
      "footer",
      "aside",
      "noscript"
    ]);

    let text = "";

    function traverse(node: Node): void {
      if (node.nodeType === Node.TEXT_NODE) {
        const nodeText = node.textContent?.trim() || "";
        if (nodeText) {
          text += nodeText + " ";
        }
      } else if (node.nodeType === Node.ELEMENT_NODE) {
        const element = node as Element;
        const tagName = element.tagName.toLowerCase();

        if (skipTags.has(tagName)) {
          return;
        }

        // Add structure markers for certain elements
        if (["h1", "h2", "h3", "h4", "h5", "h6"].includes(tagName)) {
          text += "\n## ";
        } else if (["p", "div", "li"].includes(tagName)) {
          text += "\n";
        }

        // Recursively process child nodes
        for (const child of Array.from(node.childNodes)) {
          traverse(child);
        }

        if (
          ["p", "div", "li", "h1", "h2", "h3", "h4", "h5", "h6"].includes(
            tagName
          )
        ) {
          text += "\n";
        }
      }
    }

    traverse(element);
    return text;
  }

  // Extract metadata from the page
  function extractMetadata(): PageMetadata {
    const metadata: PageMetadata = {};

    // Meta tags
    const metaTags = document.querySelectorAll<HTMLMetaElement>(
      "meta[name], meta[property]"
    );
    metaTags.forEach((tag) => {
      const name = tag.getAttribute("name") || tag.getAttribute("property");
      const content = tag.getAttribute("content");
      if (name && content) {
        metadata[name] = content;
      }
    });

    // Common metadata
    const getMetaContent = (selector: string): string => {
      return document.querySelector<HTMLMetaElement>(selector)?.content || "";
    };

    metadata.description = getMetaContent('meta[name="description"]');
    metadata.keywords = getMetaContent('meta[name="keywords"]');
    metadata.author = getMetaContent('meta[name="author"]');

    // Open Graph data
    metadata.ogTitle = getMetaContent('meta[property="og:title"]');
    metadata.ogDescription = getMetaContent('meta[property="og:description"]');
    metadata.ogImage = getMetaContent('meta[property="og:image"]');

    // Schema.org structured data
    try {
      const jsonLD = document.querySelector<HTMLScriptElement>(
        'script[type="application/ld+json"]'
      );
      if (jsonLD?.textContent) {
        metadata.structuredData = JSON.parse(jsonLD.textContent);
      }
    } catch (e) {
      // Ignore JSON parsing errors
    }

    return metadata;
  }

  // Extract important links from the page
  function extractLinks(): PageLink[] {
    const links: PageLink[] = [];
    const linkElements =
      document.querySelectorAll<HTMLAnchorElement>("a[href]");

    linkElements.forEach((link) => {
      const href = link.href;
      const text = link.textContent?.trim() || "";

      if (
        href &&
        text &&
        !href.startsWith("javascript:") &&
        !href.startsWith("#")
      ) {
        links.push({
          url: href,
          text: text,
          title: link.title || ""
        });
      }
    });

    // Return only first 20 links to avoid too much data
    return links.slice(0, 20);
  }

  // Extract images from the page
  function extractImages(): PageImage[] {
    const images: PageImage[] = [];
    const imgElements = document.querySelectorAll<HTMLImageElement>("img[src]");

    imgElements.forEach((img) => {
      if (img.src && !img.src.startsWith("data:")) {
        images.push({
          src: img.src,
          alt: img.alt || "",
          title: img.title || "",
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height
        });
      }
    });

    // Return only first 10 images to avoid too much data
    return images.slice(0, 10);
  }

  // Clean extracted text
  function cleanText(text: string): string {
    return text
      .replace(/\s+/g, " ") // Normalize whitespace
      .replace(/\n\s*\n/g, "\n") // Remove multiple newlines
      .replace(/^\s+|\s+$/g, "") // Trim
      .replace(/[^\x20-\x7E\n]/g, "") // Remove non-printable characters
      .trim();
  }

  // Highlight text on the page
  function highlightText(searchText: string): void {
    if (!searchText) return;

    // Remove existing highlights
    removeHighlights();

    // Create a tree walker to find text nodes
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null
    );

    const textNodes: Text[] = [];
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const parentElement = (node as Text).parentElement;
      if (
        parentElement &&
        parentElement.tagName !== "SCRIPT" &&
        parentElement.tagName !== "STYLE"
      ) {
        textNodes.push(node as Text);
      }
    }

    // Highlight matching text
    textNodes.forEach((textNode) => {
      const text = textNode.textContent || "";
      const regex = new RegExp(escapeRegExp(searchText), "gi");

      if (regex.test(text)) {
        const highlightedHTML = text.replace(
          regex,
          '<mark class="ai-memory-highlight">$&</mark>'
        );
        const wrapper = document.createElement("span");
        wrapper.innerHTML = highlightedHTML;
        textNode.parentNode?.replaceChild(wrapper, textNode);
      }
    });

    // Add CSS for highlights
    addHighlightCSS();
  }

  // Remove existing highlights
  function removeHighlights(): void {
    const highlights = document.querySelectorAll(".ai-memory-highlight");
    highlights.forEach((highlight) => {
      const parent = highlight.parentNode;
      if (parent) {
        parent.replaceChild(
          document.createTextNode(highlight.textContent || ""),
          highlight
        );
        parent.normalize();
      }
    });
  }

  // Add CSS for highlighting
  function addHighlightCSS(): void {
    if (document.getElementById("ai-memory-highlight-css")) return;

    const style = document.createElement("style");
    style.id = "ai-memory-highlight-css";
    style.textContent = `
            .ai-memory-highlight {
                background-color: #ffeb3b !important;
                color: #000 !important;
                padding: 1px 2px !important;
                border-radius: 2px !important;
                box-shadow: 0 0 3px rgba(255, 235, 59, 0.5) !important;
            }
        `;
    document.head.appendChild(style);
  }

  // Scroll to element
  function scrollToElement(selector: string): void {
    const element = document.querySelector(selector);
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "center" });

      const htmlElement = element as HTMLElement;
      // Add temporary highlight
      htmlElement.style.outline = "3px solid #667eea";
      htmlElement.style.outlineOffset = "2px";

      setTimeout(() => {
        htmlElement.style.outline = "";
        htmlElement.style.outlineOffset = "";
      }, 2000);
    }
  }

  // Escape special regex characters
  function escapeRegExp(string: string): string {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  // Initialize content script
  console.log("Browser AI Memory content script loaded");
})();
