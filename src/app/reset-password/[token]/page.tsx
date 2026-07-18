import Image from "next/image";
import Link from "next/link";
import { db } from "@/lib/db";
import { passwordResetTokens } from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { isResetTokenValid } from "@/lib/passwordReset";
import ResetPasswordForm from "./ResetPasswordForm";

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const [row] = await db.select().from(passwordResetTokens).where(eq(passwordResetTokens.token, token));
  const invalid = !isResetTokenValid(row);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-50 px-4 gap-6">
      <div className="flex items-center gap-2.5">
        <Image src="/keel-mark.svg" alt="Keel" width={36} height={36} />
        <div>
          <p className="text-sm font-semibold text-slate-900 leading-tight">Keel</p>
          <p className="text-xs text-slate-400 leading-tight">Guiding project success</p>
        </div>
      </div>

      <div className="w-full max-w-sm bg-white rounded-xl border border-slate-200/70 shadow-sm shadow-slate-200/60 p-6">
        {invalid ? (
          <div className="text-center py-2">
            <p className="text-sm font-semibold text-slate-900 mb-2">This link is invalid or has expired</p>
            <p className="text-xs text-slate-500 mb-4">Request a new password reset link and try again.</p>
            <Link href="/forgot-password" className="text-xs font-medium text-accent-600 hover:text-accent-700">
              Request a new link
            </Link>
          </div>
        ) : (
          <>
            <p className="text-sm font-semibold text-slate-900 mb-1">Set a new password</p>
            <p className="text-xs text-slate-400 mb-4">Choose a new password for your Keel account.</p>
            <ResetPasswordForm token={token} />
          </>
        )}
      </div>
    </div>
  );
}
