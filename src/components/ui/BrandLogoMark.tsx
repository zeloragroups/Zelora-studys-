import { BookOpenCheck } from 'lucide-react';
import type { LogoConfiguration } from '../../types';
import { cn } from '../../utils/cn';

interface BrandLogoMarkProps {
  logoConfiguration?: LogoConfiguration;
  alt?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<BrandLogoMarkProps['size']>, string> = {
  xs: 'w-7 h-7 rounded-lg',
  sm: 'w-8 h-8 rounded-xl',
  md: 'w-9 h-9 rounded-xl',
  lg: 'w-14 h-14 rounded-2xl',
};

const ICON_CLASSES: Record<NonNullable<BrandLogoMarkProps['size']>, string> = {
  xs: 'w-3.5 h-3.5',
  sm: 'w-4 h-4',
  md: 'w-[18px] h-[18px]',
  lg: 'w-7 h-7',
};

const SAFE_DATA_IMAGE_REGEX = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/i;

function isSafeLogoSrc(src?: string): string | undefined {
  if (!src || typeof src !== 'string') return undefined;
  const trimmed = src.trim();
  if (trimmed.startsWith('https://') || SAFE_DATA_IMAGE_REGEX.test(trimmed)) {
    return trimmed;
  }
  return undefined;
}

/**
 * Shared brand logo surface. Renders an Admin-uploaded image when configured,
 * otherwise falls back to the Deep Graphite + Champagne Gold Academy emblem.
 */
export function BrandLogoMark({
  logoConfiguration,
  alt = 'ZELORA STUDYS logo',
  size = 'md',
  className,
}: BrandLogoMarkProps) {
  const rawImageSrc =
    logoConfiguration?.mode === 'firebase_storage_image'
      ? logoConfiguration.downloadUrl || logoConfiguration.dataUrl
      : logoConfiguration?.mode === 'custom_local_image'
        ? logoConfiguration.dataUrl
        : undefined;
  const imageSrc = isSafeLogoSrc(rawImageSrc);

  if (imageSrc) {
    return (
      <span
        className={cn(
          SIZE_CLASSES[size],
          'bg-[var(--surface)] border border-[var(--border)] inline-flex items-center justify-center shrink-0 overflow-hidden p-0.5 shadow-xs',
          className
        )}
      >
        <img
          src={imageSrc}
          alt={alt}
          className="w-full h-full object-contain rounded-[inherit]"
        />
      </span>
    );
  }

  return (
    <span
      className={cn(
        SIZE_CLASSES[size],
        'bg-[var(--hero-surface)] border border-[var(--accent-border)] text-[var(--accent)] dark:text-[var(--accent)] inline-flex items-center justify-center shrink-0 shadow-xs',
        className
      )}
    >
      <BookOpenCheck className={ICON_CLASSES[size]} strokeWidth={1.75} aria-hidden="true" />
    </span>
  );
}
