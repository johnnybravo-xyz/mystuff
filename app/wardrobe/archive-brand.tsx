/* oxlint-disable next/no-html-link-for-pages -- Full navigation resets local archive view and filter state. */
import { Boxes } from 'lucide-react';

export function ArchiveBrand({
  className = '',
  title = 'My Stuff',
  subtitle = 'Everything you own, remembered.',
}: {
  className?: string;
  title?: string;
  subtitle?: string;
}) {
  return (
    <a
      className={`wordmark ${className}`}
      href="/"
      aria-label={`${title} home`}
    >
      <Boxes size={28} aria-hidden="true" />
      <span>
        {title.toUpperCase()}
        <span className="blue">.</span>
        <small>{subtitle.toUpperCase()}</small>
      </span>
    </a>
  );
}
