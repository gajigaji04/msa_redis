import express from "express";

const app = express();

app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({
    service: "auth-service",
    status: "ok",
  });
});

const PORT = process.env.PORT || 3002;

app.listen(PORT, () => {
  console.log(`Auth service running on http://localhost:${PORT}`);
});
