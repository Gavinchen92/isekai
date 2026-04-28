import "@testing-library/jest-dom/vitest";

process.env.GM_PROVIDER = "mock";
delete process.env.GM_OPENAI_BASE_URL;
delete process.env.OPENAI_BASE_URL;
