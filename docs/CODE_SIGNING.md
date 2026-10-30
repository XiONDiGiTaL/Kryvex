# Code signing

The two Windows EXEs in every release — `Kryvex-Setup-<version>-x64.exe` and
`Kryvex-Portable-<version>-x64.exe` — are **unsigned today**. A self-signed
certificate would not change that in any way Windows cares about: SmartScreen
treats a self-signed signature as no signature at all, so the app would still
show **Unknown publisher** while the build looked signed to its author.

This page records what signing would cost, which route is actually free, what is
already wired into the release workflow, and what a signature would and would not
change for the person running the installer.

## What a signature does and does not do

| | Unsigned | Signed with a publicly trusted certificate |
| --- | --- | --- |
| SmartScreen publisher | **Unknown publisher** | The certificate's subject, verified |
| "Windows protected your PC" | Very likely on first download | Can still appear until the download has reputation |
| File properties → Digital Signatures | Empty | Present, with a chain to a public CA |
| Tamper detection after download | SHA-256 only | Authenticode plus SHA-256 |

Microsoft's own guidance (updated 2026-05-06) says reputation accrues per
certificate and per download volume, and that a newly signed application may
still be warned about. Signing removes the *identity* problem; it does not buy a
silent first download. Anyone promising otherwise is selling something.

## Free, or not free

| Route | Cost | Publicly trusted? | Publisher the user sees |
| --- | --- | --- | --- |
| **SignPath Foundation** | **Free for accepted open-source projects** | Yes, Authenticode | `SignPath Foundation` |
| Certum Open Source Code Signing | €49 cloud / €69 card + reader (€25 activation if hardware exists) — **not free** | Yes | `Certum` "Open Source Developer" subject |
| Azure Artifact Signing (formerly Trusted Signing) | $9.99 / month Basic (5,000 signatures) — **not free** | Yes | The verified organisation |
| SSL.com code signing | Paid tiers | Yes | The verified organisation |
| Self-signed certificate | Free | **No** | Nothing useful; Windows treats it as unsigned |
| GitHub artifact attestations | Free for public repositories | **No** — provenance, not Authenticode | Not applicable to Windows trust |

So there is exactly one free path to a signature Windows trusts: **SignPath
Foundation**, and it has a consequence worth stating plainly — the publisher
line reads *SignPath Foundation*, not *XiØN* and not *Kryvex*. The certificate is
issued to the Foundation, whose HSM holds the key, and it is that subject Windows
shows. The trade is free signing for a publisher identity that is not the
project's own.

## Whether Kryvex qualifies

The Foundation's published conditions, checked against this repository:

| Condition | Kryvex |
| --- | --- |
| OSI-approved licence, no commercial dual-licensing | [MIT](../LICENSE) for the whole repository |
| Public repository the project team controls | `XiONDiGiTaL/Kryvex`, maintainer-controlled |
| Actively maintained, and the software already released | 150+ commits, `v0.9.5-hotfix.7` published |
| Functionality documented where it is downloaded | README, [SERVICES.md](SERVICES.md), the release records |
| Sign only binaries built from this repository's source and build scripts | `pnpm package:win` → electron-builder NSIS + portable, nothing else |
| Build jobs on GitHub-hosted runners | `windows-latest`, no self-hosted runner anywhere |
| MFA on team accounts, defined roles, per-release manual approval | To be set up with the application; see the policy below |
| A published code-signing policy | The next section of this page |

The Foundation decides acceptance itself; there is no published vote or
entitlement. Applying is a human step and cannot be done from CI.

## What is already wired in

[`release.yml`](../.github/workflows/release.yml) signs when — and only when — a
`SIGNPATH_API_TOKEN` secret exists. Without it the job publishes unsigned
installers exactly as it does today, so forks and clones are unaffected.

With the secret set, the `windows` job:

1. builds the two installers with `pnpm package:win`, unsigned;
2. uploads them as the `kryvex-unsigned-installers` Actions artifact;
3. submits that artifact to SignPath and waits for the per-release approval;
4. reads the signature back off both files with `Get-AuthenticodeSignature` and
   fails the release if either is not `Valid`;
5. writes `SHA256SUMS.txt` **after** signing, so the checksums describe the
   signed bytes that are published — not the unsigned ones that were built.

Step 4 exists because a step that silently signs nothing is worse than no
signing: the release would look verified and not be.

## Turning it on

1. Apply to the Foundation at <https://signpath.org/> with the repository URL,
   the licence and a link to a release. Wait for acceptance.
2. In SignPath, create the project for this repository and a signing policy that
   requires manual approval. Note its **organization id**, **project slug** and
   **signing-policy slug**.
3. Create an API token for the organization.
4. In GitHub, **Settings → Secrets and variables → Actions**:
   - secret `SIGNPATH_API_TOKEN`
   - variables `SIGNPATH_ORGANIZATION_ID`, `SIGNPATH_PROJECT_SLUG`,
     `SIGNPATH_SIGNING_POLICY_SLUG`
5. Cut the next tag. Approve the signing request in SignPath when it arrives;
   the workflow waits for it.

Removing the secret turns signing off again on the next tag. Nothing else in the
release has to change, and an unsigned release is still a valid release for the
updater — it verifies SHA-256, not a signature.

## Code-signing policy

Published here because the Foundation's terms require one.

**What is signed.** Only the two EXEs that `.github/workflows/release.yml`
produces from a tag whose name matches `package.json`, on a GitHub-hosted
`windows-latest` runner, built by `pnpm package:win` from this repository's
source.

**What is never signed.** Any build made outside that workflow — a local
`package:win`, a fork, a contributor's branch. Third-party binaries carried in
`extraResources`, including the pinned llama.cpp runtime and the Flycast engine
fetched at runtime, are not signed under this policy and are hash-pinned
independently.

**Who approves.** The maintainer, per release, by hand in SignPath. There is no
standing approval and no automatic release signing.

**Key custody.** No private key and no certificate material live in this
repository or in any build artifact. The key is held in SignPath's HSM; the only
credential here is the API token, stored as an Actions secret and never printed.

**Verifying a release.** See the next section. `SHA256SUMS.txt` remains the
primary check for integrity, and it now covers the signed bytes.

**Rotation and compromise.** Revoke the token in SignPath and replace the secret;
revoke the certificate with the Foundation if the signing path itself is suspect;
remove the secret to fall back to unsigned releases. Any of these is announced in
the release notes of the next release.

## Checking a download yourself

```powershell
Get-AuthenticodeSignature .\Kryvex-Setup-0.9.5-hotfix.7-x64.exe |
  Format-List Status, StatusMessage, SignerCertificate
```

An unsigned release — every release up to `v0.9.5-hotfix.7` — answers `NotSigned`.
A signed one answers `Valid` with the subject it was signed under. Either way, the
hash in [the release notes](RELEASE_0.9.5-hotfix.7.md) and in `SHA256SUMS.txt`
should match:

```powershell
(Get-FileHash .\Kryvex-Setup-0.9.5-hotfix.7-x64.exe -Algorithm SHA256).Hash
```

## What this does not cover

- **No signature on any release yet.** `v0.9.5-hotfix.7` and every release before
  it are unsigned; the SmartScreen notice in their release notes is accurate.
- **No reputation.** Even after the first signed release, Windows may warn until
  that certificate has enough download history.
- **The web client.** `https://xiondigital.net/Kryvex/` is protected by TLS, not
  by Authenticode; nothing here applies to it.
- **The updater does not require a signature.** It verifies SHA-256 against the
  release's `SHA256SUMS.txt`. A signed installer is a stronger claim for a human
  download, not a new gate for the update path.
