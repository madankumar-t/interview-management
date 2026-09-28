import { FormEvent, useEffect, useState } from "react";
import { PageShell } from "../components/PageShell";
import { api } from "../lib/api";
import type { UserSession } from "../types/auth";

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

export function ProfilePage({ session }: { session: UserSession }) {
  const [name, setName] = useState("");
  const [photoUrl, setPhotoUrl] = useState("");
  const [hasPhoto, setHasPhoto] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

  useEffect(() => {
    let active = true;
    let objectUrl = "";
    api.getMyProfile().then(async (profile) => {
      if (!active) return;
      setName(profile.display_name || session.name || session.email);
      setHasPhoto(profile.has_photo);
      if (profile.has_photo) {
        const blob = await api.getMyProfilePhoto();
        if (active) {
          objectUrl = URL.createObjectURL(blob);
          setPhotoUrl(objectUrl);
        }
      }
    }).catch(() => { if (active) setError("Unable to load your profile."); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [session.sub, session.name, session.email]);

  async function saveName(event: FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (!name.trim()) { setError("Enter a display name."); return; }
    setSaving(true);
    try {
      const profile = await api.updateMyProfile(name.trim());
      setName(profile.display_name);
      setMessage("Display name saved.");
      window.dispatchEvent(new Event("ims-profile-updated"));
    } catch { setError("Unable to save your display name."); }
    finally { setSaving(false); }
  }

  async function uploadPhoto(file?: File) {
    if (!file) return;
    setError("");
    setMessage("");
    if (!PHOTO_TYPES.includes(file.type) || file.size > MAX_PHOTO_BYTES) {
      setError("Choose a JPEG, PNG, or WebP image under 2 MB.");
      return;
    }
    setSaving(true);
    try {
      await api.uploadMyProfilePhoto(file);
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      setPhotoUrl(URL.createObjectURL(file));
      setHasPhoto(true);
      setMessage("Photo updated.");
      window.dispatchEvent(new Event("ims-profile-updated"));
    } catch { setError("Unable to upload your photo."); }
    finally { setSaving(false); }
  }

  async function removePhoto() {
    setSaving(true);
    setError("");
    try {
      await api.deleteMyProfilePhoto();
      if (photoUrl) URL.revokeObjectURL(photoUrl);
      setPhotoUrl("");
      setHasPhoto(false);
      setMessage("Photo removed.");
      window.dispatchEvent(new Event("ims-profile-updated"));
    } catch { setError("Unable to remove your photo."); }
    finally { setSaving(false); }
  }

  return (
    <PageShell title="Profile Settings">
      {error && <p role="alert" className="mb-4 text-sm text-red-700">{error}</p>}
      {message && <p role="status" className="mb-4 text-sm text-emerald-700">{message}</p>}
      {loading ? <p className="text-slate-500">Loading profile…</p> : (
        <div className="max-w-xl space-y-6">
          <div className="flex items-center gap-4">
            {photoUrl ? <img src={photoUrl} alt="Your profile" className="h-20 w-20 rounded-full object-cover" /> : (
              <div className="flex h-20 w-20 items-center justify-center rounded-full bg-sky-100 text-2xl font-semibold text-sky-800 dark:bg-sky-900 dark:text-sky-100">{(name || session.email).charAt(0).toUpperCase()}</div>
            )}
            <div className="space-y-2">
              <label className="block text-sm font-medium" htmlFor="profile-photo">Profile photo</label>
              <input id="profile-photo" type="file" accept="image/jpeg,image/png,image/webp" disabled={saving} onChange={(event) => { void uploadPhoto(event.target.files?.[0]); event.target.value = ""; }} className="block w-full text-sm" />
              <p className="text-xs text-slate-500">JPEG, PNG or WebP, up to 2 MB</p>
              {hasPhoto && <button type="button" disabled={saving} onClick={removePhoto} className="text-sm text-red-700 hover:underline dark:text-red-300">Remove photo</button>}
            </div>
          </div>
          <form onSubmit={saveName} className="space-y-4">
            <label className="block text-sm font-medium" htmlFor="profile-name">Display name</label>
            <input id="profile-name" maxLength={100} required value={name} onChange={(event) => setName(event.target.value)} className="w-full rounded border border-slate-300 p-2 dark:border-slate-700 dark:bg-slate-900" />
            <button type="submit" disabled={saving} className="rounded bg-indigo-600 px-4 py-2 text-white disabled:opacity-50">Save name</button>
          </form>
          <dl className="grid grid-cols-[6rem_1fr] gap-2 border-t border-slate-200 pt-4 text-sm dark:border-slate-700">
            <dt className="text-slate-500">Login</dt><dd className="break-all">{session.email}</dd>
            <dt className="text-slate-500">Roles</dt><dd>{session.groups.join(", ")}</dd>
          </dl>
        </div>
      )}
    </PageShell>
  );
}