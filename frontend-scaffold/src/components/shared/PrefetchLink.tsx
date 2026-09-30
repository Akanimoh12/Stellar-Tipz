import React, { forwardRef, useCallback } from "react";
import { Link, type LinkProps } from "react-router-dom";
import { prefetchRoute } from "@/helpers/routePrefetch";

/**
 * Drop-in `Link` that warms the target route's chunk on hover, focus or touch
 * (#1337). Prefetching is a no-op under data-saver or slow connections.
 */
const PrefetchLink = forwardRef<HTMLAnchorElement, LinkProps>(
  ({ to, onMouseEnter, onFocus, onTouchStart, ...rest }, ref) => {
    const warm = useCallback(() => {
      const path = typeof to === "string" ? to : to.pathname;
      if (path) prefetchRoute(path);
    }, [to]);

    return (
      <Link
        ref={ref}
        to={to}
        onMouseEnter={(e) => {
          warm();
          onMouseEnter?.(e);
        }}
        onFocus={(e) => {
          warm();
          onFocus?.(e);
        }}
        onTouchStart={(e) => {
          warm();
          onTouchStart?.(e);
        }}
        {...rest}
      />
    );
  },
);

PrefetchLink.displayName = "PrefetchLink";

export default PrefetchLink;
