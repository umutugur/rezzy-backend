const Restaurant = require("../models/Restaurant");
const { createQrPoster } = require("../utils/qrPoster");

exports.getTablePoster = async (req, res) => {
  try {
    const { restaurantId, tableKey } = req.params;

    const restaurant = await Restaurant.findById(restaurantId).lean();
    if (!restaurant) return res.status(404).json({ message: "Restoran bulunamadı" });

    const table = restaurant.tables.find(
      t => String(t._id) === tableKey || t.name === tableKey
    );
    if (!table) return res.status(404).json({ message: "Masa bulunamadı" });

    const qrUrl = `${process.env.PUBLIC_QR_URL}/r/${restaurantId}/t/${table._id}`;
    const pdf = await createQrPoster({
      restaurantName: restaurant.name,
      tableName: table.name,
      qrUrl,
      logoUrl: restaurant.logoUrl,   // LOGO VARSA QR'NIN ORTASINA
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${restaurant.name}-${table.name}.pdf"`);
    res.send(pdf);

  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Poster oluşturulamadı" });
  }
};