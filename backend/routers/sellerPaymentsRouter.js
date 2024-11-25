// controllers/sellerPaymentController.js
import express from 'express';
import SellerPayment from '../models/sellerPayments.js';
import PaymentsAccount from '../models/paymentsAccountModal.js';

const sellerPaymentsRouter = express.Router();

// Get seller suggestions based on partial seller name
sellerPaymentsRouter.get(('/suggestions'), async (req, res) => {
  try {
    const search = req.query.search || '';
    const regex = new RegExp(search, 'i'); // case-insensitive search
    const sellers = await SellerPayment.find({ sellerName: regex }).select('sellerName');
    res.json(sellers);
  } catch (error) {
    console.error('Error fetching seller suggestions:', error);
    res.status(500).json({ message: 'Error fetching seller suggestions' });
  }
});

// Get seller details by ID
sellerPaymentsRouter.get(('/get-seller/:id'), async (req, res) => {
  try {
    const seller = await SellerPayment.findById(req.params.id);
    if (!seller) {
      return res.status(404).json({ message: 'Seller not found' });
    }
    res.json(seller);
  } catch (error) {
    console.error('Error fetching seller details:', error);
    res.status(500).json({ message: 'Error fetching seller details' });
  }
});


sellerPaymentsRouter.get('/billpayments/all', async (req, res) => {
  try {
    // Get the date range from the query parameters sent from the frontend
    const { startDate, endDate } = req.query;

    // Validate if both startDate and endDate are provided
    if (!startDate || !endDate) {
      return res.status(400).json({ message: 'Start date and end date are required' });
    }

    // Convert to Date objects
    const start = new Date(startDate);
    const end = new Date(endDate);

    // Adjust the end date to include the entire day (if necessary)
    end.setHours(23, 59, 59, 999);

    // Fetch sellers and filter payments within the date range
    const sellers = await SellerPayment.find();
    if (!sellers || sellers.length === 0) {
      return res.status(404).json({ message: 'No seller data found' });
    }

    // Filter payments within the date range
    const paymentsByDate = sellers.map((seller) => {
      return {
        sellerId: seller.sellerId,
        sellerName: seller.sellerName,
        payments: seller.payments.filter(
          (payment) => new Date(payment.date) >= start && new Date(payment.date) <= end
        ),
      };
    });

    // Filter out sellers with no payments in the date range
    const filteredResults = paymentsByDate.filter((seller) => seller.payments.length > 0);

    res.json(filteredResults);
  } catch (error) {
    console.error('Error fetching seller payments:', error);
    res.status(500).json({ message: 'Error fetching seller payments' });
  }

});





// Add a payment to a seller
sellerPaymentsRouter.post(('/add-payments/:id'), async (req, res) => {
  try {
    const seller = await SellerPayment.findById(req.params.id);
    if (!seller) {
      return res.status(404).json({ message: 'Seller not found' });
    }

    const { amount, method, date, remark, sellerId, sellerName } = req.body;

    if (!amount || !method || !date) {
      return res.status(400).json({ message: 'Amount, method, and date are required' });
    }

    const payment = {
      amount,
      method,
      date,
      remark,
      submittedBy: req.body ? req.body.userId : 'Unknown', // Assuming you have user authentication
    };


    const accountPaymentEntry = {
      amount: amount,
      method: method,
      remark: `Purchase Payment to ${sellerName} - ${sellerId}`,
      submittedBy: req.body.userId,
    };
  
    try {
      const account = await PaymentsAccount.findOne({ accountId: method });
    
      if (!account) {
        console.log(`No account found for accountId: ${method}`);
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: 'Payment account not found' });
      }
    
      account.paymentsOut.push(accountPaymentEntry);
    
      await account.save();

    }catch(error){
      console.error('Error processing payment:', error);
      return res.status(500).json({ message: 'Error processing payment', error });
    }

    await seller.addPayment(payment);
    res.json({ message: 'Payment added successfully' });
  } catch (error) {
    console.error('Error adding payment:', error);
    res.status(500).json({ message: 'Error adding payment' });
  }
});

// Add a billing to a seller
sellerPaymentsRouter.post(('/add-billing/:id'), async (req, res) => {
  try {
    const seller = await SellerPayment.findById(req.params.id);
    if (!seller) {
      return res.status(404).json({ message: 'Seller not found' });
    }

    const { amount, date, purchaseId, invoiceNo } = req.body;

    if (!amount || !purchaseId || !invoiceNo) {
      return res.status(400).json({ message: 'Amount, purchaseId, and invoiceNo are required' });
    }

    const billing = {
      amount,
      date,
      purchaseId,
      invoiceNo,
    };

    await seller.addBilling(billing);
    res.json({ message: 'Billing added successfully' });
  } catch (error) {
    console.error('Error adding billing:', error);
    res.status(500).json({ message: 'Error adding billing' });
  }
});



// sellerPaymentsRouter.js

sellerPaymentsRouter.get('/daily/payments', async (req, res) => {
  try {
    const { date } = req.query;

    // Validate if date is provided
    if (!date) {
      return res.status(400).json({ message: 'Date is required' });
    }

    // Parse the date and define the start and end of the day in UTC
    const selectedDate = new Date(date);
    selectedDate.setUTCHours(0, 0, 0, 0);

    const nextDate = new Date(selectedDate);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);

    // Use aggregation to unwind payments and filter by date
    const sellers = await SellerPayment.aggregate([
      { $unwind: '$payments' },
      {
        $match: {
          'payments.date': { $gte: selectedDate, $lt: nextDate },
        },
      },
      {
        $group: {
          _id: '$sellerId',
          sellerName: { $first: '$sellerName' },
          payments: { $push: '$payments' },
        },
      },
    ]);

    res.json(sellers);
  } catch (error) {
    console.error('Error fetching seller payments:', error);
    res.status(500).json({ message: 'Error fetching seller payments' });
  }
});




export default sellerPaymentsRouter;
