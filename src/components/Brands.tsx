import type { Provider } from '../lib/me.js';

/**
 * The marks of the two services people sign in with.
 *
 * Lucide keeps no brand marks, by policy, so these two are Tabler's (`brand-discord`
 * and `brand-github` from @tabler/icons 3.49, MIT), drawn inline at the same stroke
 * and size as every other icon here so they sit in a row of lucide icons without
 * looking borrowed.
 */
export function BrandMark({ provider, size = 16 }: { provider: Provider; size?: number }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {provider === 'github' ? (
        <path d="M9 19c-4.3 1.4 -4.3 -2.5 -6 -3m12 5v-3.5c0 -1 .1 -1.4 -.5 -2c2.8 -.3 5.5 -1.4 5.5 -6a4.6 4.6 0 0 0 -1.3 -3.2a4.2 4.2 0 0 0 -.1 -3.2s-1.1 -.3 -3.5 1.3a12.3 12.3 0 0 0 -6.2 0c-2.4 -1.6 -3.5 -1.3 -3.5 -1.3a4.2 4.2 0 0 0 -.1 3.2a4.6 4.6 0 0 0 -1.3 3.2c0 4.6 2.7 5.7 5.5 6c-.6 .6 -.6 1.2 -.5 2v3.5" />
      ) : (
        <>
          <path d="M8 12a1 1 0 1 0 2 0a1 1 0 0 0 -2 0" />
          <path d="M14 12a1 1 0 1 0 2 0a1 1 0 0 0 -2 0" />
          <path d="M15.5 17c0 1 1.5 3 2 3c1.5 0 2.833 -1.667 3.5 -3c.667 -1.667 .5 -5.833 -1.5 -11.5c-1.457 -1.015 -3 -1.34 -4.5 -1.5l-.972 1.923a11.913 11.913 0 0 0 -4.053 0l-.975 -1.923c-1.5 .16 -3.043 .485 -4.5 1.5c-2 5.667 -2.167 9.833 -1.5 11.5c.667 1.333 2 3 3.5 3c.5 0 2 -2 2 -3" />
          <path d="M7 16.5c3.5 1 6.5 1 10 0" />
        </>
      )}
    </svg>
  );
}
