import express from 'express';
import { DailyTransaction, TransactionCategory } from '../models/dailyTransactionsModal.js';
import Billing from '../models/billingModal.js';
import PaymentsAccount from '../models/paymentsAccountModal.js';

const transactionRouter = express.Router();

// Middleware to protect routes (ensure user is authenticated)

// GET /api/daily/transactions?date=YYYY-MM-DD
transactionRouter.get('/transactions', async (req, res) => {
    try {
      const { date } = req.query;
      if (!date) {
        return res.status(400).json({ message: 'Date query parameter is required.' });
      }
  
      const start = new Date(date);
      const end = new Date(date);
      end.setDate(end.getDate() + 1);
  
      const transactions = await DailyTransaction.find({
        date: { $gte: start, $lt: end }
      })// Populate category details if needed
  
      res.json(transactions);
    } catch (error) {
      console.error('Error fetching transactions:', error);
      res.status(500).json({ message: 'Server Error' });
    }
  });

// POST /api/daily/transactions
transactionRouter.post('/transactions', async (req, res) => {
  try {
    const {
      date,
      amount,
      paymentFrom,
      paymentTo,
      category,
      method, // This is the accountId
      remark,
      billId,
      purchaseId,
      transportId,
      userId,
      type, // 'in' or 'out'
    } = req.body;

    // Create a new DailyTransaction object
    const newTransaction = new DailyTransaction({
      date,
      amount,
      paymentFrom,
      paymentTo,
      category,
      method,
      remark,
      billId,
      purchaseId,
      transportId,
      user: userId,
      type,
    });

    // Find the account by method (method is accountId)
    const myAccount = await PaymentsAccount.findOne({ accountId: method });

    if (!myAccount) {
      return res.status(404).json({ message: 'Payment account not found' });
    }

    if (type === 'in') {
      // Payment In
      const accountPaymentEntry = {
        amount: amount,
        method: method,
        remark: `Payment from ${paymentFrom}`,
        submittedBy: userId,
      };
      myAccount.paymentsIn.push(accountPaymentEntry);
    } else if (type === 'out') {
      // Payment Out
      const accountPaymentEntry = {
        amount: amount,
        method: method,
        remark: `Payment to ${paymentTo}`,
        submittedBy: userId,
      };
      myAccount.paymentsOut.push(accountPaymentEntry);
    } else {
      return res.status(400).json({ message: 'Invalid transaction type' });
    }

    // Save the updated account
    await myAccount.save();

    // Save the transaction
    const savedTransaction = await newTransaction.save();

    res.status(201).json(savedTransaction);
  } catch (error) {
    console.error('Error creating transaction:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// GET /api/daily/transactions/categories
transactionRouter.get('/transactions/categories', async (req, res) => {
  try {
    const categories = await TransactionCategory.find();
    res.json(categories);
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// POST /api/daily/transactions/categories
transactionRouter.post('/transactions/categories', async (req, res) => {
  try {
    const { name } = req.body;
    if (!name) {
      return res.status(400).json({ message: 'Category name is required.' });
    }
    const existingCategory = await TransactionCategory.findOne({ name });
    if (existingCategory) {
      return res.status(400).json({ message: 'Category already exists.' });
    }
    const newCategory = new TransactionCategory({ name });
    const savedCategory = await newCategory.save();
    res.status(201).json(savedCategory);
  } catch (error) {
    console.error('Error creating category:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

// Similarly, ensure /api/daily/billing routes are implemented
// Example: GET /api/daily/billing?date=YYYY-MM-DD
transactionRouter.get('/billing', async (req, res) => {
  try {
    const { date } = req.query;
    const start = new Date(date);
    const end = new Date(date);
    end.setDate(end.getDate() + 1);

    const billings = await Billing.find({
      invoiceDate: { $gte: start, $lt: end },
      user: req.body.userId,
    }).populate('otherExpenses'); // Assuming otherExpenses is a reference

    res.json(billings);
  } catch (error) {
    console.error('Error fetching billings:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});


transactionRouter.get('/allbill/payments', async (req, res) => {
  try {
    const { date } = req.query;

    if (!date) {
      return res.status(400).json({ message: 'Date is required' });
    }

    const start = new Date(date);
    if (isNaN(start)) {
      return res.status(400).json({ message: 'Invalid date format' });
    }

    const end = new Date(start);
    end.setDate(end.getDate() + 1);

    // Fetch all bills for the user (not filtering by invoiceDate)
    const billings = await Billing.find({
      user: req.body.userId, // Ensure this is passed in the request body
    }).populate('products') // If products are references
      .populate('deliveries') // If deliveries are references
      .lean(); // Use lean() for better performance if you don't need Mongoose document methods

    // Filter payments done on the specified date
    const payments = [];
    billings.forEach(billing => {
      (billing.payments || []).forEach(payment => {
        if (payment.date >= start && payment.date < end) {
          payments.push({
            billingId: billing._id,
            amount: payment.amount,
            method: payment.method,
            date: payment.date,
            remark: payment.remark,
          });
        }
      });
    });

    // Filter other expenses done on the specified date
    const otherExpenses = [];
    billings.forEach(billing => {
      (billing.otherExpenses || []).forEach(expense => {
        if (expense.date >= start && expense.date < end) {
          otherExpenses.push({
            billingId: billing._id,
            amount: expense.amount,
            remark: expense.remark,
            date: expense.date,
          });
        }
      });
    });

    // Format the response
    const formattedResponse = {
      billings, // All bills
      payments: payments || [], // Payments filtered by date
      otherExpenses: otherExpenses || [], // Other expenses filtered by date
    };

    res.json(formattedResponse);
  } catch (error) {
    console.error('Error fetching billings:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});




transactionRouter.post('/trans/transfer', async (req, res) => {
  try {
    const {
      date,
      amount,
      paymentFrom,
      paymentTo,
      category,
      method,
      remark,
      userId,
    } = req.body;

    if (!paymentFrom || !paymentTo) {
      return res.status(400).send({ message: 'Both paymentFrom and paymentTo are required' });
    }

    const parsedPaymentAmount = parseFloat(amount);
    if (isNaN(parsedPaymentAmount) || parsedPaymentAmount <= 0) {
      return res.status(400).send({ message: 'Invalid amount' });
    }

    // Fetch payment accounts
    const fromAccount = await PaymentsAccount.findOne({ accountId: paymentFrom });
    const toAccount = await PaymentsAccount.findOne({ accountId: paymentTo });

    if (!fromAccount || !toAccount) {
      return res.status(404).send({ message: 'Invalid accounts specified' });
    }

    // Check if the `fromAccount` has sufficient balance
    // if (fromAccount.balanceAmount < parsedPaymentAmount) {
    //   return res.status(400).send({ message: 'Insufficient funds in the source account' });
    // }

    // Create 'out' transaction
    const outTransaction = new DailyTransaction({
      date,
      amount: parsedPaymentAmount,
      paymentFrom,
      paymentTo,
      category,
      method,
      remark,
      type: 'transfer',
      user: userId,
    });

    // Prepare payment entries
    const accountFromPaymentEntry = {
      amount: parsedPaymentAmount,
      method,
      remark: `Transferred to ${paymentTo}`,
      submittedBy: userId,
    };

    const accountToPaymentEntry = {
      amount: parsedPaymentAmount,
      method,
      remark: `Transferred from ${paymentFrom}`,
      submittedBy: userId,
    };

    // Update accounts
    fromAccount.paymentsOut.push(accountFromPaymentEntry);
    toAccount.paymentsIn.push(accountToPaymentEntry);

    // Save changes
    await fromAccount.save();
    await toAccount.save();

    // Save transaction
    await outTransaction.save();

    res.status(201).send({ message: 'Transfer successful', transaction: outTransaction });
  } catch (error) {
    console.error(error);
    res.status(500).send({ message: 'Error in transferring funds' });
  }
});


export default transactionRouter;
