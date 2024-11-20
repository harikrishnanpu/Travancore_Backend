import express from 'express';
import Purchase from '../models/purchasemodals.js';



const purchaseRouter = express.Router();


purchaseRouter.get('/get/:id', async (req, res) => {
    const purchase = await Purchase.findById(req.params.id);
    if (purchase) {
      res.json(purchase);
    } else {
      res.status(404);
      throw new Error("Purchase not found");
    }
});


purchaseRouter.get('/purchases/payments', async (req, res) => {
  const { date } = req.query;

  if (!date) {
    res.status(400);
    throw new Error('Date parameter is required');
  }

  const start = new Date(date);
  start.setHours(0, 0, 0, 0);
  const end = new Date(date);
  end.setHours(23, 59, 59, 999);

  const purchases = await Purchase.find({
    'payments.date': { $gte: start, $lte: end },
  });

  const payments = [];

  purchases.forEach((purchase) => {
    purchase.payments.forEach((payment) => {
      const paymentDate = new Date(payment.date);
      if (paymentDate >= start && paymentDate <= end) {
        payments.push({
          _id: payment._id,
          purchaseId: purchase._id,
          sellerName: purchase.sellerName,
          invoiceNo: purchase.invoiceNo,
          amount: payment.amount,
          method: payment.method,
          remark: payment.remark,
          date: payment.date,
        });
      }
    });
  });

  res.json(payments);
});


purchaseRouter.post('/:id/payments', async (req, res) => {
    const { amount, method, remark, date } = req.body;

    const purchase = await Purchase.findById(req.params.id);
  
    if (purchase) {
      const payment = {
        amount,
        method,
        remark,
        date
      };
  
      purchase.payments.push(payment);
  
      // Recalculate payment status
      const totalPayments = purchase.payments.reduce(
        (sum, payment) => sum + payment.amount,
        0
      );
  
      if (totalPayments >= purchase.totalAmount) {
        purchase.paymentStatus = "Paid";
      } else if (totalPayments > 0) {
        purchase.paymentStatus = "Partial";
      } else {
        purchase.paymentStatus = "Pending";
      }
  
      await purchase.save();
  
      res.status(201).json({ message: "Payment added successfully" });
    } else {
      res.status(404);
      throw new Error("Purchase not found");
    }
})




purchaseRouter.get('/payments/suggesstion', async (req, res) => {
    const { search, suggestions } = req.query;

    if (suggestions === "true" && search) {
      const regex = new RegExp(search, "i"); // case-insensitive search
      const purchases = await Purchase.find({ invoiceNo: { $regex: regex } })
        .select("_id invoiceNo")
        .limit(10);
      res.json(purchases);
    } else {
      // Handle other GET requests if needed
      res.status(400).json({ message: "Invalid request" });
    }
})




export default purchaseRouter;