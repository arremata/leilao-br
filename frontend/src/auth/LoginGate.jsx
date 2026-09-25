/**
 * Route gating lives inside App so previews can keep the catalog public while
 * production requires a server-validated Google session. This wrapper remains
 * only as the composition boundary around AuthContext.
 */
export default function LoginGate({ children }) {
  return children;
}
