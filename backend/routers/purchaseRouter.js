import express from 'express';
import Purchase from '../models/purchasemodals.js';
import Transportation from '../models/transportModal.js';



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
});


purchaseRouter.get('/get-all/transportCompany', async (req, res) => {
  const transportCompanies = await Transportation.distinct('transportCompanyName');
  res.json(transportCompanies);
});



purchaseRouter.get('/lastOrder/id', async (req, res) => {
  try {
    // Fetch the invoice with the highest sequence number starting with 'K'
    const billing = await Purchase.findOne({ purchaseId: /^KP\d+$/ })
      .sort({ purchaseId: -1 })
      .collation({ locale: "en", numericOrdering: true });

    // Check if an invoice was found
    if (billing) {
      res.json(billing.purchaseId);
    } else {
      const billing = await Purchase.find()
      .sort({ purchaseId: -1 })
      .collation({ locale: "en", numericOrdering: true });
    const newId = "KP1"
      res.json(newId);
    }
  } catch (error) {
    res.status(500).json({ message: 'Error fetching last order' });
  }
});




export default purchaseRouter;