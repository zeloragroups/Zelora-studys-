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
  lg: 'w-13 h-13 rounded-2xl',
};

const ICON_CLASSES: Record<NonNullable<BrandLogoMarkProps['size']>, string> = {
  xs: 'w-3.5 h-3.5',
  sm: 'w-4 h-4',
  md: 'w-4 h-4',
  lg: 'w-6 h-6',
};

/**
 * Shared brand logo surface. Renders an Admin-uploaded local image when
 * mode === 'custom_local_image' with a valid data URL, otherwise falls back
 * to the crisp violet emblem icon.
 */
export function BrandLogoMark({
  logoConfiguration,
  alt = 'Tuition centre logo',
  size = 'md',
  className,
}: BrandLogoMarkProps) {
  const imageSrc =
    logoConfiguration?.mode === 'firebase_storage_image'
      ? logoConfiguration.downloadUrl || logoConfiguration.dataUrl
      : logoConfiguration?.mode === 'custom_local_image'
        ? logoConfiguration.dataUrl
        : undefined;

  if (imageSrc) {
    return (
      <span
        className={cn(
          SIZE_CLASSES[size],
          'bg-white dark:bg-[#202844] border border-[#E5E7EF] dark:border-[#303A55] inline-flex items-center justify-center shrink-0 overflow-hidden p-0.5 shadow-xs',
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
        'bg-[#7552D9] dark:bg-[#8B5CF6] text-white inline-flex items-center justify-center shrink-0 shadow-xs',
        className
      )}
    >
      <BookOpenCheck className={ICON_CLASSES[size]} aria-hidden="true" />
    </span>
  );
}
