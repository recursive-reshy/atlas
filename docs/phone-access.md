# Phone access

Use Atlas from your phone or Mac, or let another person use it, while it runs on a small virtual machine in Google Cloud (the VM, [`deploy.md`](deploy.md)). This guide uses [Tailscale](https://tailscale.com): a private network between your own devices, with `tailscale serve` giving the app a private HTTPS address that only your tailnet can reach (ADRs 0060, 0077). Nothing in Atlas depends on Tailscale; this is setup on the VM, the phone and the Mac.

Checked against Tailscale's documentation on 2026-10-23 (Serve, HTTPS certificates, machine names, CLI reference) and the Debian install on 2026-11-02. The section on sharing the app with another person was written from the app's side only and has **not** been checked against Tailscale's documentation or tried yet; if a menu name there is wrong, trust Tailscale's docs and fix this file. If a command or menu name elsewhere no longer matches, do the same.

## What you get
- The VM accepts nothing from the internet. The app listens on `127.0.0.1:3100` on the VM only.
- `tailscale serve` on the VM forwards a private `https://<machine>.<tailnet>.ts.net` address to that port. Only devices signed in to your tailnet can open it, and your Mac does not have to be on.
- Adding that address to your home screen opens Atlas full-screen on your first module (Melete for someone who only has Melete). There is no offline mode: grading needs the server, which is always on.
- Everyone signs in with Google, and only people the admin has added get in (ADR 0061). The tailnet is still the first protection, so keep **Funnel off** (below).

## Set up

1. **Install Tailscale** on the phone and the Mac, and sign in to the same tailnet on both. The VM joins it in step 3.
2. **Choose a machine name that reveals nothing.** When Serve gets its certificate, the machine's full name goes into public Certificate Transparency logs, where anyone can read it. The tailnet name hides your account, but the machine name is visible, so don't use your name, employer or anything private. The VM's name is set when it joins (`tailscale up --hostname=<name>`); to rename it later, use the **Machines** page of the [admin console](https://login.tailscale.com/admin/machines), open the menu on the machine's row and choose **Edit machine name**. Do this before step 4.
3. **Join the VM to the tailnet.** On the VM: `sudo tailscale up --ssh --hostname=<name>`, open the link it prints and approve the machine. In the admin console, disable key expiry for it ([`deploy.md`](deploy.md#3-tailscale)).
4. **Turn on MagicDNS and HTTPS** in the admin console, on the [DNS page](https://login.tailscale.com/admin/dns): enable **MagicDNS** if it is off, then under **HTTPS Certificates** choose **Enable HTTPS** and acknowledge that machine names are published.
5. **Publish Atlas to the tailnet.** On the VM:

   ```sh
   sudo tailscale serve --bg 3100
   ```

   `--bg` keeps it running in the background, across reboots. The command prints the address, of the form `https://<machine>.<tailnet>.ts.net`.
6. **Tell Atlas its address.** Put the printed address in `APP_ORIGINS` in `/etc/atlas/atlas.env` on the VM (comma-separated, no path) and run `sudo systemctl restart atlas`. Then add its two redirect URIs in Google Cloud ([`google-cloud-setup.md`](google-cloud-setup.md#2-authorized-redirect-uris)). Without this the sign-in answers "This address isn't configured in APP_ORIGINS".
7. **Check it:** `tailscale serve status` on the VM lists what is published. Open the address on the phone (Tailscale must be on there too) and sign in with Google.
8. **Add it to the home screen.** Safari: Share → **Add to Home Screen**. Chrome: menu → **Add to Home screen** (or **Install app**). It opens full-screen as "Atlas". Sign in from the installed app the first time. Whether that session stays in the installed app on an iPhone is still to be confirmed on a real device; if it doesn't, it is a bug to report, not something to work around.

To undo it: `sudo tailscale serve reset` clears the Serve configuration.

On the Mac, `http://localhost:3100` still works for development with `docker compose up` and has nothing to do with the VM.

## Sharing the app with another person
Atlas has accounts, so a second person can use it from their own device (ADR 0061):

1. **Give them access to the VM on your tailnet.** In the Tailscale admin console, either invite them to your tailnet, or share the VM's node with them (Machines → the VM's menu → **Share**). They install Tailscale and accept.
2. **Add them in the app** (Settings → Admin → **Add user**): their Google email, a name, and the modules they may use. If your Google app is in *Testing*, add them as a test user in Google Cloud too ([`google-cloud-setup.md`](google-cloud-setup.md#3-who-can-sign-in)); the hosted setup uses *In production*, which needs no test users.
3. **They open the Tailscale address and sign in with Google.** The first time they choose a vault folder the admin has set up for them (a sync client keeps it current; [`deploy.md`](deploy.md#adding-a-second-user)). The app cannot create a new vault folder on the VM. They see only their own notes, jobs and questions.

Their address needs no change in `APP_ORIGINS` if it is the same Tailscale address. A person who is removed in Admin is signed out at once.

## Keep Funnel off
Funnel would put the app on the public internet, where anyone could reach the sign-in page and the Google redirect, with the tailnet no longer a barrier. Never run `tailscale funnel`. It is off unless you turn it on; `tailscale funnel status` shows whether anything is exposed and `tailscale funnel reset` clears it.

## Gmail
Connect Gmail from whichever address you are using (Settings → Sources): the redirect goes back to that address, as long as it is in `APP_ORIGINS` and its Gmail redirect URI is in the Google client ([`google-cloud-setup.md`](google-cloud-setup.md#2-authorized-redirect-uris)). Once connected, the poller runs on the VM.

## When the phone can't reach it
- **The page doesn't load or times out:** Tailscale is off on the phone, or the VM is down. Check the Tailscale app on the phone and the machine's status in the admin console, and `gcloud compute instances list` for the VM.
- **"Can't connect" with Tailscale on:** the stack is down. On the VM run `sudo systemctl status atlas` and `docker ps`, and `sudo systemctl restart atlas` if needed. Check `curl http://127.0.0.1:3100/api/health` on the VM.
- **Serve isn't running:** `tailscale serve status` shows nothing. Run `sudo tailscale serve --bg 3100` again.
- **A certificate error:** HTTPS isn't enabled yet (step 4), or the machine was renamed after Serve was set up. Run `sudo tailscale serve reset`, then step 5 again.
- **"This address isn't configured in APP_ORIGINS" when signing in:** step 6 wasn't done, or the address differs (for example after renaming the machine). Fix `APP_ORIGINS` and the Google redirect URIs.
- **Google says "redirect_uri_mismatch":** the Tailscale address's redirect URIs aren't in the Google client yet.
- **The sign-in page says you are not allowed:** the Google account isn't in Admin, or has been removed.
- **Grading fails but the question shows:** the VM can't reach the Claude API. Rate yourself from the reference answer; the failure is in the app's log (`dc logs app` on the VM, see [`deploy.md`](deploy.md)).
