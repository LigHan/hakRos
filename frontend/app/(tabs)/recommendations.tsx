import { Redirect } from 'expo-router';

/** Keep previously shared links working; recommendations now live at the root. */
export default function RecommendationsRedirect() {
  return <Redirect href="/" />;
}
