# India-hosted synthetic preview and Android pilot

This package deploys the **existing synthetic demonstration**. It must not be used for real employee records, live salary payments, or statutory filings. The production release gates remain in [production-gates.md](production-gates.md).

## Hosting choice and expected cost

Choose an **Oracle Cloud Always Free Ampere A1 VM** with Mumbai (`ap-mumbai-1`) as the account's home region. Hyderabad (`ap-hyderabad-1`) is a second India option. Oracle says Always Free compute is limited to the home region, requires a credit card for most signups, and does not charge that card unless the account is upgraded. VM capacity can be unavailable, and idle instances may be reclaimed. Stay within the console's **Always Free** shape and storage limits. This is a low-cost preview choice, not a production availability guarantee. [Oracle Free Tier](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier.htm) · [Always Free resources](https://docs.oracle.com/en-us/iaas/Content/FreeTier/freetier_topic-Always_Free_Resources.htm) · [India regions](https://docs.oracle.com/en-us/iaas/Content/General/Concepts/regions.htm)

A DNS name pointing to the VM is needed for automatic HTTPS. For the no-cost preview, choose a free `*.duckdns.org` subdomain and point it to the VM's public IP; keep its account token private. Duck DNS describes its service as free, and Caddy can issue HTTPS for a name pointing to the server. An organization-owned domain is preferable for a later live system. Domain purchase, paid cloud resources, and a Google Play developer account are separate costs. Google currently lists a one-time US$25 Play Console registration fee. [Duck DNS](https://www.duckdns.org/) · [Caddy HTTPS](https://caddyserver.com/docs/automatic-https) · [Google Play account setup](https://support.google.com/googleplay/android-developer/answer/6112435)

## Website deployment

1. Create the Oracle account in the Mumbai home region and an Always Free Ubuntu ARM VM with a public IP. Allow inbound TCP 80 and 443, and restrict SSH to your own IP. Keep port 4000 private. If the public IP changes, update the Duck DNS record.
2. Install Docker Engine with the Compose plugin on the VM. Copy this project folder to it, excluding `node_modules` and local `data`. A Git repository or secure file transfer works.
3. Create a Duck DNS subdomain, set its IPv4 address to the VM's public IP, and wait for DNS to resolve. Copy `.env.preview.example` to `.env.preview` and put your `subdomain.duckdns.org` in `SITE_DOMAIN`.
4. In the project directory on the VM, run:

   ```sh
   docker compose --env-file .env.preview -f compose.preview.yml up -d --build
   ```

5. Open `https://YOUR-DNS-NAME/api/health` and expect `{"ok":true,"mode":"demo",...}`. Then open the same HTTPS name without `/api/health` to reach the website. Caddy requests and renews HTTPS certificates when DNS and ports are correct.
6. Get the six distinct demo credentials **privately on the VM**:

   ```sh
   docker compose --env-file .env.preview -f compose.preview.yml exec api cat /app/data/individual-demo-credentials.txt
   ```

   Give each tester only their own credential. Admins create additional accounts from **Settings → Roles & access**. New users replace their temporary password on first sign-in.

The database and credentials stay in the Docker `payroll_data` volume. Preserve and back up that volume if you want to retain preview changes. Rebuilding the containers does not reset it. The Caddy proxy serves the website and routes `/api/*` to the private API container. Run only one API instance against this PGlite volume.

## Android build A: direct-install APK

The app in `apps/mobile` has an EAS `preview` profile for an installable APK. You need a free Expo account and the HTTPS website above. Expo currently includes a limited number of Android builds on its free plan. [Expo pricing](https://expo.dev/pricing) · [APK guide](https://docs.expo.dev/build-reference/apk/)

1. Before the first build, choose an Android package ID owned by your organization and change `android.package` in `apps/mobile/app.json`. Keep that ID the same for later updates.
2. From `apps/mobile`, install or run EAS CLI, sign in, and link the project with `eas init`. Keep the committed `eas.json` profiles.
3. Set EAS's **preview** environment variable `EXPO_PUBLIC_API_URL` to `https://YOUR-DNS-NAME`. This URL is included in the app bundle and contains no secret. [Expo environment setup](https://docs.expo.dev/eas/environment-variables/)
4. Run `eas build --platform android --profile preview`. Download the resulting APK from the Expo build page and install it on your testers' devices.

The Android device needs internet access to the hosted HTTPS API. A release bundle built without `EXPO_PUBLIC_API_URL` shows a configuration error at sign-in; create a new build after setting the address.

## Android build B: Google Play internal testing

Use the same package ID and signing lineage as the APK. Run `eas build --platform android --profile play-internal` to produce an Android App Bundle (AAB). Create the app in the organization's Play Console, upload the AAB to the **Internal testing** track, and add testers there. Internal tests are available to invited testers by link. [Expo build profiles](https://docs.expo.dev/build/eas-json/) · [Google Play testing](https://support.google.com/googleplay/android-developer/answer/9859751)

The included profiles prepare both build formats, but no signed APK/AAB or Play listing exists yet. EAS and Play account linking, package ownership, signing credentials, and the hosted URL must be supplied by the organization before those artifacts can be created.
