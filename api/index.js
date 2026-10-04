module.exports = (req, res) => {
  res.status(200).json({
    ok: true,
    service: "Tamari",
    message: "Vercel API is running"
  });
};