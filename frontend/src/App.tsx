import { Outlet, ScrollRestoration } from "react-router-dom";
import { Layout } from "./components/Layout";

export function App() {
  return (
    <Layout>
      <ScrollRestoration />
      <Outlet />
    </Layout>
  );
}
