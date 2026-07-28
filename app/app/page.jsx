// The site's one route. The written study renders here as server components; the desk is
// a fragment away (`#terminal`) and is mounted by the shell, so both surfaces share one
// address and the URL never leaves the deployment's own path.
import { AcademicDocument } from "../features/academic";

export default function HomePage() {
  return <AcademicDocument />;
}
