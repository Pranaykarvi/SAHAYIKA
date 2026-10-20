import { ProfileEditor } from "@/components/profile-editor";
import { SampleBadge } from "@/components/sample-badge";
import { ApiError, unwrap } from "@/lib/api/client";
import { serverApi } from "@/lib/api/server";
import { fmtDate } from "@/lib/format";

export default async function GroupProfilePage() {
  const api = await serverApi();
  const me = unwrap(await api.GET("/me"));
  if (!me.groupId) throw new Error("this account has no group");

  let profile = null;
  try {
    profile = unwrap(
      await api.GET("/groups/{id}/profile", {
        params: { path: { id: me.groupId } },
      }),
    );
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 404)) throw err;
  }

  return (
    <div className="mx-auto max-w-md space-y-4">
      <div>
        <h1 className="flex flex-wrap items-center gap-2 text-2xl font-semibold tracking-tight">
          Group profile
          {profile?.isSynthetic ? <SampleBadge /> : null}
        </h1>
        <p className="text-base text-muted-foreground">
          {profile
            ? `Last updated ${fmtDate(profile.updatedAt)}`
            : "No profile yet — filling this in is what makes matching possible."}
        </p>
      </div>
      <ProfileEditor groupId={me.groupId} initial={profile} />
    </div>
  );
}
