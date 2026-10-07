"use client";

import Script from "next/script";

const CDN = "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5";

declare global {
  interface Window {
    SwaggerUIBundle?: (options: Record<string, unknown>) => unknown;
  }
}

export function SwaggerUI() {
  return (
    <>
      <link rel="stylesheet" href={`${CDN}/swagger-ui.css`} precedence="default" />
      {/* Swagger UI ships a light theme only, so it gets its own light surface. */}
      <div id="swagger-ui" className="overflow-hidden rounded-lg border border-line bg-white text-black" />
      <Script
        src={`${CDN}/swagger-ui-bundle.js`}
        strategy="afterInteractive"
        onReady={() => {
          window.SwaggerUIBundle?.({
            url: "/api/openapi.json",
            dom_id: "#swagger-ui",
            persistAuthorization: true,
            tryItOutEnabled: true,
            defaultModelsExpandDepth: 0,
          });
        }}
      />
    </>
  );
}
