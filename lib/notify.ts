/**
 * Email hook for later. v1 does not send mail.
 */
export async function notify(_event: {
  type: "application" | "join_request" | "message";
  to: string | string[];
  subject: string;
  body: string;
}) {
  void _event;
}
