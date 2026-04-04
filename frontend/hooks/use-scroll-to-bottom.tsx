import { useCallback, useEffect, useRef, useState } from "react";

export function useScrollToBottom({
  status = "ready",
}: {
  status?: "submitted" | "streaming" | "ready" | "error";
} = {}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const isAtBottomRef = useRef(true);
  const isUserScrollingRef = useRef(false);
  const statusRef = useRef(status);

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  // Keep ref in sync with state
  useEffect(() => {
    isAtBottomRef.current = isAtBottom;
  }, [isAtBottom]);

  const getContentBottomTop = useCallback(() => {
    if (!containerRef.current) {
      return 0;
    }

    if (endRef.current) {
      return endRef.current.offsetTop;
    }

    return containerRef.current.scrollHeight;
  }, []);

  const checkIfAtBottom = useCallback(() => {
    if (!containerRef.current) {
      return true;
    }
    const { scrollTop, clientHeight } = containerRef.current;
    const contentBottomTop = getContentBottomTop();
    return scrollTop + clientHeight >= contentBottomTop - 100;
  }, [getContentBottomTop]);

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    if (!containerRef.current) {
      return;
    }

    const contentBottomTop = getContentBottomTop();
    const targetTop = Math.max(
      0,
      contentBottomTop - containerRef.current.clientHeight + 24
    );

    containerRef.current.scrollTo({
      top: targetTop,
      behavior,
    });
  }, [getContentBottomTop]);

  // Handle user scroll events
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    let scrollTimeout: ReturnType<typeof setTimeout>;

    const handleScroll = () => {
      // Mark as user scrolling
      isUserScrollingRef.current = true;
      clearTimeout(scrollTimeout);

      // Update isAtBottom state
      const atBottom = checkIfAtBottom();
      setIsAtBottom(atBottom);
      isAtBottomRef.current = atBottom;

      // Reset user scrolling flag after scroll ends
      scrollTimeout = setTimeout(() => {
        isUserScrollingRef.current = false;
      }, 150);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      container.removeEventListener("scroll", handleScroll);
      clearTimeout(scrollTimeout);
    };
  }, [checkIfAtBottom]);

  // Auto-scroll when content changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const scrollIfNeeded = () => {
      if (statusRef.current === "submitted") {
        return;
      }

      // Only auto-scroll if user was at bottom and isn't actively scrolling
      if (isAtBottomRef.current && !isUserScrollingRef.current) {
        requestAnimationFrame(() => {
          const contentBottomTop = getContentBottomTop();
          const targetTop = Math.max(0, contentBottomTop - container.clientHeight + 24);

          // Avoid upward corrections while streaming/rendering. This prevents
          // bounce/jitter where the viewport moves down and then drifts up.
          if (targetTop <= container.scrollTop + 1) {
            return;
          }

          container.scrollTo({
            top: targetTop,
            behavior: statusRef.current === "streaming" ? "smooth" : "instant",
          });
          setIsAtBottom(true);
          isAtBottomRef.current = true;
        });
      }
    };

    // Watch for DOM changes
    const mutationObserver = new MutationObserver(scrollIfNeeded);
    mutationObserver.observe(container, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    // Watch for size changes
    const resizeObserver = new ResizeObserver(scrollIfNeeded);
    resizeObserver.observe(container);

    // Also observe children for size changes
    for (const child of container.children) {
      resizeObserver.observe(child);
    }

    return () => {
      mutationObserver.disconnect();
      resizeObserver.disconnect();
    };
  }, [getContentBottomTop]);

  function onViewportEnter() {
    setIsAtBottom(true);
    isAtBottomRef.current = true;
  }

  function onViewportLeave() {
    setIsAtBottom(false);
    isAtBottomRef.current = false;
  }

  return {
    containerRef,
    endRef,
    isAtBottom,
    scrollToBottom,
    onViewportEnter,
    onViewportLeave,
  };
}
