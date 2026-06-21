import React, { useState, useEffect, useRef } from 'react';

/**
 * 判断当前是否为移动端尺寸（<=768px）。
 * 仅在挂载/resize 时计算；不订阅媒体查询以避免组件重渲染抖动。
 */
function useIsMobile(): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia('(max-width: 768px)').matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(max-width: 768px)');
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    // 浏览器兼容：早期 Safari 使用 addListener
    if (mql.addEventListener) {
      mql.addEventListener('change', handler);
      return () => mql.removeEventListener('change', handler);
    } else if ((mql as MediaQueryList & { addListener?: (cb: (e: MediaQueryListEvent) => void) => void }).addListener) {
      (mql as MediaQueryList & { addListener: (cb: (e: MediaQueryListEvent) => void) => void; removeListener: (cb: (e: MediaQueryListEvent) => void) => void }).addListener(handler);
      return () => (mql as MediaQueryList & { removeListener: (cb: (e: MediaQueryListEvent) => void) => void }).removeListener(handler);
    }
  }, []);

  return isMobile;
}

/**
 * 支持现代格式的背景图片组件
 * - 移动端：WebP 优先（更小），PNG 回退
 * - 桌面端：PNG 优先（更高质量），WebP 回退
 * - 用 ref 锁定首次成功加载的格式，避免屏幕旋转触发重载抖动
 */
export const BackgroundImage: React.FC<{
  image: string;
  className?: string;
  children?: React.ReactNode;
}> = ({ image, className = '', children }) => {
  const [imageSrc, setImageSrc] = useState('');
  const [isLoaded, setIsLoaded] = useState(false);
  const isMobile = useIsMobile();
  // 锁定首次加载的格式，避免 resize/orientation 变化导致重新加载
  const lockedFormatRef = useRef<'webp' | 'png' | null>(null);

  useEffect(() => {
    let isMounted = true;

    // 已有锁定格式时直接复用，不再做格式探测
    if (lockedFormatRef.current) {
      const cached = lockedFormatRef.current;
      const cachedPath = `/${image}.${cached}`;
      const img = new Image();
      img.onload = () => {
        if (isMounted) {
          console.log(`[BackgroundImage] ✓ Cached format loaded (${cached}): ${cachedPath}`);
          setImageSrc(cachedPath);
          setIsLoaded(true);
        }
      };
      img.src = cachedPath;
      return () => {
        isMounted = false;
      };
    }

    console.log(`[BackgroundImage] Loading image: ${image} (mobile=${isMobile})`);

    // 根据设备选择格式优先级
    const primary = isMobile ? 'webp' : 'png';
    const fallback = isMobile ? 'png' : 'webp';

    const primaryPath = `/${image}.${primary}`;
    const fallbackPath = `/${image}.${fallback}`;

    const loadWithFallback = () => {
      const primaryImg = new Image();
      primaryImg.onload = () => {
        if (isMounted) {
          console.log(`[BackgroundImage] ✓ ${primary.toUpperCase()} loaded: ${primaryPath}`);
          lockedFormatRef.current = primary;
          setImageSrc(primaryPath);
          setIsLoaded(true);
        }
      };
      primaryImg.onerror = () => {
        if (!isMounted) return;
        console.log(`[BackgroundImage] ✗ ${primary.toUpperCase()} failed, trying ${fallback.toUpperCase()}: ${fallbackPath}`);
        const fallbackImg = new Image();
        fallbackImg.onload = () => {
          if (isMounted) {
            console.log(`[BackgroundImage] ✓ ${fallback.toUpperCase()} loaded: ${fallbackPath}`);
            lockedFormatRef.current = fallback;
            setImageSrc(fallbackPath);
            setIsLoaded(true);
          }
        };
        fallbackImg.onerror = () => {
          if (isMounted) {
            console.error(`[BackgroundImage] ✗✗ Both formats failed for: ${image}`);
          }
        };
        fallbackImg.src = fallbackPath;
      };
      primaryImg.src = primaryPath;
    };

    loadWithFallback();

    return () => {
      isMounted = false;
    };
    // 仅在 image 变化时重跑；isMobile 变化由 lockedFormatRef 覆盖
  }, [image, isMobile]);

  const style: React.CSSProperties = {
    position: 'fixed',
    inset: 0,
    backgroundImage: imageSrc ? `url(${imageSrc})` : 'none',
    backgroundSize: 'cover',
    backgroundPosition: 'center center',
    backgroundRepeat: 'no-repeat',
    backgroundAttachment: 'fixed',
    zIndex: 0,
    opacity: isLoaded ? 1 : 0,
    transition: 'opacity 0.3s ease-in',
  };

  return (
    <>
      {imageSrc && <div style={style} className={className} />}
      {children}
    </>
  );
};
