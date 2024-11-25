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
    const newTransaction = new DailyTransaction({
      ...req.body,
      user: req.body.userId,
    });
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
    if (fromAccount.balanceAmount < parsedPaymentAmount) {
      return res.status(400).send({ message: 'Insufficient funds in the source account' });
    }

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
