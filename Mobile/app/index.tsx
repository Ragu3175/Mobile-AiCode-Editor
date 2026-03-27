import { Redirect } from "expo-router";

export default function Index() {
  // @ts-ignore - Expo router typed routes generation can be delayed
  return <Redirect href={"/login" as any} />;
}
