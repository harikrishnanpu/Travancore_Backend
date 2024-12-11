import express from 'express';
import { DailyTransaction, TransactionCategory } from '../models/dailyTransactionsModal.js';
import Billing from '../models/billingModal.js';
import PaymentsAccount from '../models/paymentsAccountModal.js';

const transactionRouter = express.Router();

// Middleware to protect routes (ensure user is authenticated)

// GET /api/daily/transactions?date=YYYY-MM-DD
transactionRouter.get('/transactions', async (req, res) => {
  try {
    const { fromDate, toDate } = req.query;

    // Validate presence of both dates
    if (!fromDate || !toDate) {
      return res.status(400).json({ message: 'Both fromDate and toDate query parameters are required.' });
    }

    // Convert to Date objects
    const start = new Date(fromDate);
    const end = new Date(toDate);

    // Validate date formats
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ message: 'Invalid date format. Use YYYY-MM-DD.' });
    }

    // Ensure fromDate is not after toDate
    if (start > end) {
      return res.status(400).json({ message: 'fromDate cannot be after toDate.' });
    }

    // Include the entire 'toDate' day
    end.setHours(23, 59, 59, 999);

    // Aggregation pipeline to fetch transactions and ensure only matching dates are retrieved
    const transactions = await DailyTransaction.aggregate([
      {
        $match: {
          date: { $gte: start, $lte: end },
        },
      },
      {
        $lookup: {
          from: 'transactioncategories', // Collection name for categories
          localField: 'category',       // Category field in DailyTransaction
          foreignField: 'name',         // Matching field in TransactionCategory
          as: 'categoryDetails',
        },
      },
      {
        $unwind: {
          path: '$categoryDetails',
          preserveNullAndEmptyArrays: true, // Allow transactions without matching categories
        },
      },
      {
        $project: {
          _id: 1,
          date: 1,
          amount: 1,
          type: 1,
          paymentFrom: 1,
          paymentTo: 1,
          method: 1,
          remark: 1,
          billId: 1,
          user: 1,
          // If categoryDetails is present, use its name; otherwise, use the original category string
          category: {
            $ifNull: ['$categoryDetails.name', '$category']
          },
        },
      },
      {
        $sort: { date: -1 }, // Sort by date descending
      },
    ]);

    // Filter transactions to ensure they strictly fall within the date range
    const filteredTransactions = transactions.filter(transaction => {
      const transactionDate = new Date(transaction.date);
      return transactionDate >= start && transactionDate <= end;
    });

    // Map transactions to include payment details explicitly
    const formattedTransactions = filteredTransactions.map(transaction => {
      return {
        _id: transaction._id,
        date: transaction.date,
        amount: transaction.amount,
        type: transaction.type,
        paymentDetails: transaction.type === 'in' ? transaction.paymentFrom : transaction.paymentTo,
        method: transaction.method,
        remark: transaction.remark,
        billId: transaction.billId,
        user: transaction.user,
        category: transaction.category,
      };
    });

    res.json(formattedTransactions);
  } catch (error) {
    console.error('Error fetching transactions:', error);
    res.status(500).json({ message: 'Internal Server Error while fetching transactions.' });
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
      type, // 'in', 'out', or 'transfer'
    } = req.body;

    // Validate required fields
    if (!date || !amount || !category || !method || !userId || !type) {
      return res.status(400).json({ message: 'Missing required fields.' });
    }

    // Validate transaction type
    const validTypes = ['in', 'out', 'transfer'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ message: 'Invalid transaction type.' });
    }

    // Additional validations based on transaction type
    if ((type === 'in' || type === 'transfer') && !paymentFrom) {
      return res.status(400).json({ message: 'paymentFrom is required for this transaction type.' });
    }

    if ((type === 'out' || type === 'transfer') && !paymentTo) {
      return res.status(400).json({ message: 'paymentTo is required for this transaction type.' });
    }

    // Parse and validate amount
    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      return res.status(400).json({ message: 'Invalid amount.' });
    }

    // Fetch the payment account by method (accountId)
    const myAccount = await PaymentsAccount.findOne({ accountId: method });
    if (!myAccount) {
      return res.status(404).json({ message: 'Payment account not found.' });
    }

    // Initialize payment entry
    let accountPaymentEntry = {};

    if (type === 'in') {
      // Payment In
      const referenceId = 'IN' + Date.now().toString();

      accountPaymentEntry = {
        amount: parsedAmount,
        method: method,
        remark: `Payment from ${paymentFrom}`,
        referenceId: referenceId,
        submittedBy: userId,
        date: new Date(date),
      };

      myAccount.paymentsIn.push(accountPaymentEntry);
      myAccount.balanceAmount += parsedAmount; // Update balance
    } else if (type === 'out') {
      // Payment Out
      const referenceId = 'OUT' + Date.now().toString();

      accountPaymentEntry = {
        amount: parsedAmount,
        method: method,
        remark: `Payment to ${paymentTo}`,
        referenceId: referenceId,
        submittedBy: userId,
        date: new Date(date),
      };

      myAccount.paymentsOut.push(accountPaymentEntry);
      myAccount.balanceAmount -= parsedAmount; // Update balance

      // Optional: Check for negative balance
      // if (myAccount.balanceAmount < 0) {
      //   return res.status(400).json({ message: 'Insufficient funds in the payment account.' });
      // }
    } else if (type === 'transfer') {
      // Transfer
      // paymentFrom and paymentTo are accountIds
      // Validate that both accounts exist
      const fromAccount = await PaymentsAccount.findOne({ accountId: paymentFrom });
      const toAccount = await PaymentsAccount.findOne({ accountId: paymentTo });

      if (!fromAccount || !toAccount) {
        return res.status(404).json({ message: 'One or both payment accounts not found.' });
      }

      if (fromAccount.balanceAmount < parsedAmount) {
        return res.status(400).json({ message: 'Insufficient funds in the source account.' });
      }

      // Generate unique reference IDs for each payment entry
      const referenceIdOut = 'OUT' + Date.now().toString();
      const referenceIdIn = 'IN' + Date.now().toString();

      // Prepare payment entries
      const transferOutEntry = {
        amount: parsedAmount,
        method: method,
        remark: `Transferred to ${paymentTo}`,
        referenceId: referenceIdOut,
        submittedBy: userId,
        date: new Date(date),
      };

      const transferInEntry = {
        amount: parsedAmount,
        method: method,
        remark: `Transferred from ${paymentFrom}`,
        referenceId: referenceIdIn,
        submittedBy: userId,
        date: new Date(date),
      };

      // Update fromAccount
      fromAccount.paymentsOut.push(transferOutEntry);
      fromAccount.balanceAmount -= parsedAmount;

      // Update toAccount
      toAccount.paymentsIn.push(transferInEntry);
      toAccount.balanceAmount += parsedAmount;

      // Save updated accounts
      await fromAccount.save();
      await toAccount.save();
    }

    // Save the updated account
    await myAccount.save();

    // Create and save the new DailyTransaction
    const newTransaction = new DailyTransaction({
      date,
      amount: parsedAmount,
      paymentFrom: paymentFrom || '',
      paymentTo: paymentTo || '',
      category,
      method,
      remark: remark || '',
      billId: billId || null,
      purchaseId: purchaseId || null,
      transportId: transportId || null,
      user: userId,
      type,
    });

    const savedTransaction = await newTransaction.save();

    res.status(201).json(savedTransaction);
  } catch (error) {
    console.error('Error creating transaction:', error);
    res.status(500).json({ message: 'Server Error while creating transaction.' });
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
    const { fromDate, toDate } = req.query;

    // Validate presence of both dates
    if (!fromDate || !toDate) {
      return res.status(400).json({ message: 'Both fromDate and toDate are required.' });
    }

    // Convert to Date objects
    const start = new Date(fromDate);
    const end = new Date(toDate);

    // Validate date formats
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return res.status(400).json({ message: 'Invalid date format. Use YYYY-MM-DD.' });
    }

    // Ensure fromDate is not after toDate
    if (start > end) {
      return res.status(400).json({ message: 'fromDate cannot be after toDate.' });
    }

    // Adjust end date to include the entire day
    end.setHours(23, 59, 59, 999);

    // Fetch all bills
    const billings = await Billing.find()
      .populate('products') // If products are references
      .populate('deliveries') // If deliveries are references
      .lean(); // Use lean() for better performance if you don't need Mongoose document methods

    // Initialize arrays for payments and other expenses
    const payments = [];
    const otherExpenses = [];

    // Iterate through billings to collect payments and other expenses within date range
    billings.forEach(billing => {
      (billing.payments || []).forEach(payment => {
        const paymentDate = new Date(payment.date);
        if (paymentDate >= start && paymentDate <= end) {
          payments.push({
            billingId: billing._id,
            amount: payment.amount,
            method: payment.method,
            date: payment.date,
            remark: payment.remark,
          });
        }
      });

      (billing.otherExpenses || []).forEach(expense => {
        const expenseDate = new Date(expense.date);
        if (expenseDate >= start && expenseDate <= end) {
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
      billings: billings.filter(billing => {
        const billingDate = new Date(billing.invoiceDate);
        return billingDate >= start && billingDate <= end;
      }),
      payments, // Payments filtered by date range
      otherExpenses, // Other expenses filtered by date range
    };

    res.json(formattedResponse);
  } catch (error) {
    console.error('Error fetching billings:', error);
    res.status(500).json({ message: 'Server Error while fetching billings and payments.' });
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

    // Validate required fields
    if (!date || !amount || !paymentFrom || !paymentTo || !category || !method || !userId) {
      return res.status(400).json({ message: 'All fields are required.' });
    }

    // Validate paymentFrom and paymentTo
    if (paymentFrom === paymentTo) {
      return res.status(400).json({ message: 'paymentFrom and paymentTo cannot be the same.' });
    }

    // Parse and validate amount
    const parsedPaymentAmount = parseFloat(amount);
    if (isNaN(parsedPaymentAmount) || parsedPaymentAmount <= 0) {
      return res.status(400).json({ message: 'Invalid amount.' });
    }

    // Fetch payment accounts
    const fromAccount = await PaymentsAccount.findOne({ accountId: paymentFrom });
    const toAccount = await PaymentsAccount.findOne({ accountId: paymentTo });

    if (!fromAccount || !toAccount) {
      return res.status(404).json({ message: 'One or both payment accounts not found.' });
    }

    // Check if the `fromAccount` has sufficient balance
    if (fromAccount.balanceAmount < parsedPaymentAmount) {
      return res.status(400).json({ message: 'Insufficient funds in the source account.' });
    }

    // Create 'transfer' transaction
    const transferTransaction = new DailyTransaction({
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

    // Generate unique reference IDs for each payment entry
    const referenceIdOut = 'OUT' + Date.now().toString();
    const referenceIdIn = 'IN' + Date.now().toString();

    // Prepare payment entries with reference IDs
    const accountFromPaymentEntry = {
      amount: parsedPaymentAmount,
      method,
      remark: `Transferred to ${paymentTo}`,
      referenceId: referenceIdOut,
      submittedBy: userId,
      date: new Date(date),
    };

    const accountToPaymentEntry = {
      amount: parsedPaymentAmount,
      method,
      remark: `Transferred from ${paymentFrom}`,
      referenceId: referenceIdIn,
      submittedBy: userId,
      date: new Date(date),
    };

    // Update accounts
    fromAccount.paymentsOut.push(accountFromPaymentEntry);
    toAccount.paymentsIn.push(accountToPaymentEntry);

    // Update account balances
    fromAccount.balanceAmount -= parsedPaymentAmount;
    toAccount.balanceAmount += parsedPaymentAmount;

    // Save changes
    await fromAccount.save();
    await toAccount.save();

    // Save transaction
    await transferTransaction.save();

    res.status(201).json({ message: 'Transfer successful.', transaction: transferTransaction });
  } catch (error) {
    console.error('Error in transferring funds:', error);
    res.status(500).json({ message: 'Error in transferring funds.' });
  }
});


export default transactionRouter;
