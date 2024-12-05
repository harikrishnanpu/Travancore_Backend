// controllers/sellerPaymentController.js
import express from 'express';
import SellerPayment from '../models/sellerPayments.js';
import PaymentsAccount from '../models/paymentsAccountModal.js';
import expressAsyncHandler from 'express-async-handler';
import SupplierAccount from '../models/supplierAccountModal.js';
import mongoose from 'mongoose';

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
sellerPaymentsRouter.post(
  '/add-payments/:id',
  expressAsyncHandler(async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { id } = req.params;
      const {
        amount,
        method,
        date,
        remark,
        sellerId,
        sellerName,
        userId,
      } = req.body;

      // Validate required fields
      if (!amount || !method || !date || !sellerId || !sellerName) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          message: 'Amount, method, date, sellerId, and sellerName are required',
        });
      }

      // Find the SellerPayment document
      const sellerPayment = await SellerPayment.findOne({ sellerId }).session(session);
      if (!sellerPayment) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: 'Seller payment account not found' });
      }

      // Find the SupplierAccount document
      const supplierAccount = await SupplierAccount.findOne({ sellerId }).session(session);
      if (!supplierAccount) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: 'Supplier account not found' });
      }

      const paymentReferenceId = 'PAY' + Date.now().toString();

      // Create the payment object
      const payment = {
        amount,
        method,
        date,
        remark,
        submittedBy: userId || 'Unknown', // Adjust according to your authentication setup
      };

      // Create the account payment entry
      const accountPaymentEntry = {
        amount: amount,
        method: method,
        remark: `Purchase Payment to ${sellerName} - ${sellerId}`,
        submittedBy: userId || 'Unknown',
        date: date,
        referenceId: paymentReferenceId,
      };

      try {
        // Find the PaymentsAccount by accountId (method)
        const account = await PaymentsAccount.findOne({ accountId: method }).session(session);

        if (!account) {
          await session.abortTransaction();
          session.endSession();
          return res.status(404).json({ message: 'Payment account not found' });
        }

        // Add payment to PaymentsAccount
        account.paymentsOut.push(accountPaymentEntry);
        // Recalculate totals if necessary
        account.totalAmountOut = (account.totalAmountOut || 0) + amount;
        account.balance = (account.balance || 0) - amount;
        await account.save({ session });

        // Add payment to SellerPayment
        sellerPayment.payments.push(payment);
        // Recalculate totals
        sellerPayment.totalAmountPaid = (sellerPayment.totalAmountPaid || 0) + amount;
        sellerPayment.paymentRemaining = sellerPayment.totalAmountBilled - sellerPayment.totalAmountPaid;
        await sellerPayment.save({ session });

        // Add payment to SupplierAccount
        supplierAccount.payments.push({
          amount,
          date,
          submittedBy: userId || 'Unknown',
          remark,
          method
        });
        // Recalculate totals
        supplierAccount.paidAmount = (supplierAccount.paidAmount || 0) + amount;
        supplierAccount.pendingAmount = supplierAccount.totalBillAmount - supplierAccount.paidAmount;
        await supplierAccount.save({ session });

        // Commit the transaction
        await session.commitTransaction();
        session.endSession();

        res.json({ message: 'Payment added successfully' });
      } catch (error) {
        await session.abortTransaction();
        session.endSession();
        console.error('Error processing payment:', error);
        res.status(500).json({ message: 'Error processing payment', error: error.message });
      }
    } catch (error) {
      await session.abortTransaction();
      session.endSession();
      console.error('Error adding payment:', error);
      res.status(500).json({ message: 'Error adding payment', error: error.message });
    }
  })
);


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

    if (!date) {
      return res.status(400).json({ message: 'Date is required' });
    }

    const selectedDate = new Date(date);
    if (isNaN(selectedDate)) {
      return res.status(400).json({ message: 'Invalid date format' });
    }

    selectedDate.setUTCHours(0, 0, 0, 0);
    const nextDate = new Date(selectedDate);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);

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
