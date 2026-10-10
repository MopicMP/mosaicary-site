import { PROVIDERS, PROVIDER_NAMES, canSignInWith, signInPath, type Me } from '../lib/me.js';
import { BrandMark } from './Brands.js';
import { Hint } from './Hint.js';

/**
 * Both ways in, side by side, for a page that has nothing to show until somebody
 * signs in.
 *
 * The same two the corner menu offers, laid out as buttons because here they are the
 * whole of what the page can do. One that is not set up yet stays in its place,
 * quieter, with the reason on the hover: taken out, the page would say there is only
 * one way in.
 */
export function SignInWays({ me, back }: { me: Me; back: string }) {
  return (
    <div className="alone-ways">
      {PROVIDERS.map((provider) =>
        canSignInWith(me, provider) ? (
          <a key={provider} className="chip go alone-go" href={signInPath(provider, back)}>
            <BrandMark provider={provider} size={15} />
            Через {PROVIDER_NAMES[provider]}
          </a>
        ) : (
          <Hint key={provider} says="Этот вход ещё не настроен">
            <span className="chip alone-go off">
              <BrandMark provider={provider} size={15} />
              Через {PROVIDER_NAMES[provider]}
            </span>
          </Hint>
        ),
      )}
    </div>
  );
}
