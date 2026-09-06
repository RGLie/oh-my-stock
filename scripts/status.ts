import { providerHealth } from "../server/providers";
for (const provider of await providerHealth(true))
  console.log(
    `${provider.name}: ${provider.version || "not installed"} · ${provider.authenticated ? "logged in" : "login required"}`,
  );
