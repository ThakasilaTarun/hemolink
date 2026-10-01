/** Result for hospital blood-request donor notifications */
export type DonorAlertToast = {
  title: string;
  description: string;
  variant?: "default" | "destructive";
};

export function getDonorAlertToast(
  alertError: { message?: string } | null,
  alertData: Record<string, unknown> | null | undefined
): DonorAlertToast {
  const bloodGroupHint = (bg?: string) =>
    bg
      ? ` Donors with blood group ${bg} can see it in their portal.`
      : " Matching donors can see it in their portal.";

  if (alertError) {
    const msg = (alertError.message || "").toLowerCase();
    if (
      msg.includes("404") ||
      msg.includes("not found") ||
      msg.includes("failed to send a request to the edge function")
    ) {
      return {
        title: "Request published",
        description:
          "Saved successfully. Online portal alerts are active; deploy send-donor-alerts for SMS/email.",
      };
    }
    return {
      title: "Request saved",
      description: `Could not reach alert service: ${alertError.message || "unknown error"}.`,
      variant: "destructive",
    };
  }

  const notified = Number(alertData?.notified ?? 0);
  const message = typeof alertData?.message === "string" ? alertData.message : "";
  const errorText = typeof alertData?.error === "string" ? alertData.error : "";

  if (alertData?.success === false) {
    return {
      title: "Request published",
      description:
        message ||
        errorText ||
        "No SMS/email sent (Twilio/Resend may not be configured). Donors can still view the request online.",
    };
  }

  if (notified > 0) {
    return {
      title: "Alerts sent successfully",
      description: message || `${notified} matching donor(s) notified.`,
    };
  }

  return {
    title: "Request published",
    description:
      message ||
      `No donors received SMS/email (none eligible or contact missing).${bloodGroupHint()}`,
  };
}
