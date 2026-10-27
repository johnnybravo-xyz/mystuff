# First run

The setup URL is an operator capability. Open it privately and do not paste it into tickets or chat.

Print the current link at any time before setup completes:

```sh
docker compose exec app mystuff setup-token
```

The wizard covers:

1. **Welcome.** The setup token from the link is checked immediately. If it is not current, for example because the volume was recreated or the token was rotated, the page explains that the link has expired and asks the user to get the latest link from whoever installed My Stuff. The wizard shows no commands; operators find the link in the logs or with `mystuff setup-token`.
2. **Administrator.** Display name, a 12+ character password entered twice and stored as Argon2id, and the installation title and subtitle.
3. **Region.** Locale, time zone, and base currency, with suggestions and a live preview of how dates and amounts will look.
4. **Profiles.** Household profile labels, up to 20, each unique. Profiles are filters, not separate logins.
5. **Collections.** At least one enabled collection, including Pantry and Pets.
6. **Features.** Wishlist, outfit ideas, optional demo items, and the public shop. The shop switch is available only when `MYSTUFF_PUBLIC_URL` is set to an HTTPS origin, and enabling it requires confirming that published listings are public.
7. **Review.** A summary of every choice with links back to each step.

Each step is validated when you press Continue, and errors appear next to the field that needs attention. The server repeats the same checks when setup is submitted.

The completion screen offers a secret-free recovery guide download with the backup, verify, and password-reset commands for the operator.

Setup commits once at the final step. Reloading or restarting the container before then is safe; the token stays the same. After completion the setup token cannot reopen setup, even if the container environment changes.

Settings remains the home for branding, region, profiles, collections, features, shop copy, price privacy, and the dismissible getting-started checklist. Removing a profile is blocked until referenced items, outfits, and budgets are reassigned.
