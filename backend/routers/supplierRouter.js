// routes/supplierRouter.js
import express from 'express';
import { body, validationResult } from 'express-validator';
import SupplierAccount from '../models/supplierAccountModal.js';
import mongoose from 'mongoose';
import SellerPayment from '../models/sellerPayments.js';
import PaymentsAccount from '../models/paymentsAccountModal.js';

const supplierRouter = express.Router();

/**
 * @route   POST /api/suppliers/create
 * @desc    Create a new supplier account
 * @access  Protected (Assuming authentication middleware is applied)
 */
supplierRouter.post(
  '/create',
  async (req, res) => {

    try {
      const {
        sellerName,
        bills,
        payments,
        sellerAddress,
        sellerId,
      } = req.body;

      // Check if there are duplicate invoice numbers within the bills
      const invoiceNos = bills.map((bill) => bill.invoiceNo.trim());
      const uniqueInvoiceNos = new Set(invoiceNos);
      if (invoiceNos.length !== uniqueInvoiceNos.size) {
        return res.status(400).json({ message: 'Duplicate invoice numbers are not allowed within bills.' });
      }

      // Create a new SupplierAccount instance
      const newSupplierAccount = new SupplierAccount({
        sellerId: sellerId.trim(),
        sellerName: sellerName.trim(),
        sellerAddress: sellerAddress.trim(),
        bills: bills.map((bill) => ({
          invoiceNo: bill.invoiceNo.trim(),
          billAmount: parseFloat(bill.billAmount),
          invoiceDate: bill.invoiceDate ? new Date(bill.invoiceDate) : undefined,
        }))
      });


  // **Handle Payments**
  if (payments !== undefined && payments[0].amount < 0) {

    // Add new payments
    for (const payment of addedPayments) {
      const paymentReferenceId = 'PAY' + Date.now().toString();
      const paymentEntry = {
        amount: parseFloat(payment.amount),
        date: payment.date ? new Date(payment.date) : new Date(),
        method: payment.method.trim(),
        submittedBy: payment.submittedBy.trim(),
        remark: payment.remark ? payment.remark.trim() : '',
      };
      newSupplierAccount.payments.push(paymentEntry);

      // Update PaymentsAccount
      const paymentsAccount = await PaymentsAccount.findOne({ accountId: payment.method.trim() }).session(session);
      if (!paymentsAccount) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: `Payment account ${payment.method.trim()} not found` });
      }
      paymentsAccount.paymentsOut.push({
        amount: parseFloat(payment.amount),
        method: payment.method.trim(),
        remark: `Payment to supplier ${account.sellerName}`,
        submittedBy: payment.submittedBy.trim(),
        referenceId: paymentReferenceId,
        date: payment.date ? new Date(payment.date) : new Date(),
      });
      await paymentsAccount.save({ session });
    }

    // Handle removed payments in PaymentsAccount
    for (const payment of removedPayments) {
      const paymentsAccount = await PaymentsAccount.findOne({ accountId: payment.method.trim() }).session(session);
      if (paymentsAccount) {
        paymentsAccount.paymentsOut = paymentsAccount.paymentsOut.filter(
          (p) =>
            !(
              p.amount === payment.amount &&
              p.date.getTime() === payment.date.getTime() &&
              p.submittedBy === payment.submittedBy &&
              p.remark === (payment.remark ? payment.remark.trim() : '')
            )
        );
        await paymentsAccount.save({ session });
      }
    }
  }

      // Save the new supplier account to the database
      const savedAccount = await newSupplierAccount.save();

      res.status(201).json(savedAccount);
    } catch (error) {
      console.error('Error creating supplier account:', error);

      // Handle duplicate key errors (e.g., duplicate supplierId or accountId)
      if (error.code === 11000) {
        const duplicateField = Object.keys(error.keyPattern)[0];
        return res.status(400).json({ message: `${duplicateField} must be unique.` });
      }

      res.status(500).json({ message: 'Server Error' });
    }
  }
);

/**
 * @route   DELETE /api/suppliers/:id/delete
 * @desc    Delete a supplier account by ID
 * @access  Protected (Assuming authentication middleware is applied)
 */
supplierRouter.delete('/:id/delete', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    // Find and delete the SupplierAccount
    const account = await SupplierAccount.findByIdAndDelete(req.params.id).session(session);
    if (!account) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Supplier Account not found' });
    }

    // Delete the associated SellerPayment record
    const sellerPaymentAccount = await SellerPayment.findOneAndDelete({ sellerId: account.sellerId }).session(session);

    // Remove payments from PaymentsAccount
    const paymentMethods = account.payments.map((payment) => payment.method.trim());
    for (const method of paymentMethods) {
      const paymentsAccount = await PaymentsAccount.findOne({ accountId: method }).session(session);
      if (paymentsAccount) {
        // Filter out payments linked to the deleted supplier
        paymentsAccount.paymentsOut = paymentsAccount.paymentsOut.filter(
          (payment) => payment.remark !== `Payment to supplier ${account.sellerName}`
        );
        await paymentsAccount.save({ session });
      }
    }

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    res.json({ message: 'Supplier Account and associated data deleted successfully' });
  } catch (error) {
    console.error('Error deleting supplier account:', error);
    await session.abortTransaction();
    session.endSession();
    res.status(500).json({ message: 'Server Error' });
  }
});


/**
 * @route   GET /api/suppliers/allaccounts
 * @desc    Get all supplier accounts
 * @access  Protected (Assuming authentication middleware is applied)
 */
supplierRouter.get('/allaccounts', async (req, res) => {
  try {
    // Optionally, implement pagination, filtering, or sorting based on query parameters
    const accounts = await SupplierAccount.find().sort({ createdAt: -1 });
    res.json(accounts);
  } catch (error) {
    console.error('Error fetching supplier accounts:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

/**
 * @route   GET /api/suppliers/get/:id
 * @desc    Get a specific supplier account by ID
 * @access  Protected (Assuming authentication middleware is applied)
 */
supplierRouter.get('/get/:id', async (req, res) => {
  try {
    const account = await SupplierAccount.findById(req.params.id);
    if (!account) {
      return res.status(404).json({ message: 'Supplier Account not found' });
    }
    res.json(account);
  } catch (error) {
    console.error('Error fetching supplier account:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

/**
 * @route   PUT /api/suppliers/:id/update
 * @desc    Update a supplier account by ID
 * @access  Protected (Assuming authentication middleware is applied)
 */
supplierRouter.put(
  '/:id/update',
  [
    // Validation
    body('supplierName').trim().notEmpty().withMessage('Supplier Name cannot be empty'),
    body('supplierAddress').trim().notEmpty().withMessage('Supplier Address cannot be empty'),
    body('bills').isArray().withMessage('Bills must be an array'),
    body('bills.*.invoiceNo').trim().notEmpty().withMessage('Invoice Number is required for each bill'),
    body('bills.*.billAmount').isFloat({ min: 0 }).withMessage('Bill Amount must be a positive number'),
    body('bills.*.invoiceDate').optional().isISO8601().toDate().withMessage('Invalid Invoice Date'),
    body('payments').isArray().withMessage('Payments must be an array'),
    body('payments.*.amount').isFloat({ min: 0 }).withMessage('Payment Amount must be a positive number'),
    body('payments.*.submittedBy').trim().notEmpty().withMessage('Submitted By is required for each payment'),
    body('payments.*.method').trim().notEmpty().withMessage('Payment method is required'),
    body('payments.*.date').optional().isISO8601().toDate().withMessage('Invalid Payment Date'),
    body('payments.*.remark').optional().trim(),
    body('supplierId').trim().notEmpty().withMessage('Supplier ID cannot be empty'),
  ],
  async (req, res) => {
    // Handle validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // Return the first validation error
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const { supplierName, bills, payments, supplierAddress, supplierId } = req.body;

      // Find the supplier account by ID
      const account = await SupplierAccount.findById(req.params.id).session(session);
      if (!account) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: 'Supplier Account not found' });
      }

      // Find or create the SellerPayment document
      let sellerPayment = await SellerPayment.findOne({ sellerId: account.sellerId }).session(session);
      if (!sellerPayment) {
        sellerPayment = new SellerPayment({
          sellerId: account.sellerId,
          sellerName: account.sellerName,
          billings: [],
          payments: [],
        });
      }

      // Update fields if they are provided
      if (supplierName !== undefined) {
        account.sellerName = supplierName.trim();
        sellerPayment.sellerName = supplierName.trim();
      }

      if (supplierAddress !== undefined) {
        account.sellerAddress = supplierAddress.trim();
      }

      if (supplierId !== undefined && supplierId.trim() !== account.sellerId) {
        // Update sellerId in all related documents
        sellerPayment.sellerId = supplierId.trim();
        account.sellerId = supplierId.trim();
      }

      // **Handle Bills**
      if (bills !== undefined) {
        // Check for duplicate invoice numbers within the bills
        const invoiceNos = bills.map((bill) => bill.invoiceNo.trim());
        const uniqueInvoiceNos = new Set(invoiceNos);
        if (invoiceNos.length !== uniqueInvoiceNos.size) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ message: 'Duplicate invoice numbers are not allowed within bills.' });
        }

        // Determine added and removed bills
        const existingInvoiceNos = account.bills.map((bill) => bill.invoiceNo);
        const newInvoiceNos = bills.map((bill) => bill.invoiceNo.trim());

        const addedBills = bills.filter((bill) => !existingInvoiceNos.includes(bill.invoiceNo.trim()));
        const removedBills = account.bills.filter((bill) => !newInvoiceNos.includes(bill.invoiceNo));

        // Update bills in SupplierAccount
        account.bills = bills.map((bill) => ({
          invoiceNo: bill.invoiceNo.trim(),
          billAmount: parseFloat(bill.billAmount),
          invoiceDate: bill.invoiceDate ? new Date(bill.invoiceDate) : undefined,
        }));

        // Update billings in SellerPayment
        // Remove old bills
        sellerPayment.billings = sellerPayment.billings.filter(
          (billing) => !removedBills.some((bill) => bill.invoiceNo === billing.invoiceNo)
        );

        // Add new bills
        addedBills.forEach((bill) => {
          sellerPayment.billings.push({
            amount: parseFloat(bill.billAmount),
            date: bill.invoiceDate ? new Date(bill.invoiceDate) : new Date(),
            invoiceNo: bill.invoiceNo.trim(),
          });
        });
      }

      // **Handle Payments**
      if (payments !== undefined) {
        // Determine added and removed payments
        const existingPaymentIds = account.payments.map((payment) => payment._id.toString());
        const newPaymentIds = payments.map((payment) => payment._id).filter(Boolean);

        const addedPayments = payments.filter((payment) => !existingPaymentIds.includes(payment._id));
        const removedPayments = account.payments.filter(
          (payment) => !newPaymentIds.includes(payment._id.toString())
        );

        // Update payments in SupplierAccount
        account.payments = payments.map((payment) => ({
          amount: parseFloat(payment.amount),
          date: payment.date ? new Date(payment.date) : new Date(),
          method: payment.method.trim(),
          submittedBy: payment.submittedBy.trim(),
          remark: payment.remark ? payment.remark.trim() : '',
        }));


        sellerPayment.payments = payments.map((payment) => ({
          amount: parseFloat(payment.amount),
          date: payment.date ? new Date(payment.date) : new Date(),
          method: payment.method.trim(),
          submittedBy: payment.submittedBy.trim(),
          remark: payment.remark ? payment.remark.trim() : '',
        }));

        // Update payments in SellerPayment
        // Remove old payments
        sellerPayment.payments = sellerPayment.payments.filter(
          (payment) => !removedPayments.some((p) => p._id.toString() === payment._id.toString())
        );

        // Add new payments
        for (const payment of addedPayments) {
          const paymentReferenceId = 'PAY' + Date.now().toString();
          // const paymentEntry = {
          //   amount: parseFloat(payment.amount),
          //   date: payment.date ? new Date(payment.date) : new Date(),
          //   method: payment.method.trim(),
          //   submittedBy: payment.submittedBy.trim(),
          //   remark: payment.remark ? payment.remark.trim() : '',
          // };
          // sellerPayment.payments.push(paymentEntry);

          // Update PaymentsAccount
          // Handle added, updated, and removed payments
const paymentsAccount = await PaymentsAccount.findOne({ accountId: account.method.trim() }).session(session);
if (!paymentsAccount) {
    await session.abortTransaction();
    session.endSession();
    return res.status(404).json({ message: `Payment account ${account.method.trim()} not found` });
}

// Map existing payments by referenceId for easy lookup
const existingPaymentsMap = new Map(
    paymentsAccount.paymentsOut.map((payment) => [payment.referenceId, payment])
);

// Update payments in PaymentsAccount
for (const payment of payments) {
    const referenceId = payment.referenceId || `PAY${Date.now()}`;
    if (existingPaymentsMap.has(referenceId)) {
        // Update existing payment
        const existingPayment = existingPaymentsMap.get(referenceId);
        existingPayment.amount = parseFloat(payment.amount);
        existingPayment.date = payment.date ? new Date(payment.date) : new Date();
        existingPayment.method = payment.method.trim();
        existingPayment.submittedBy = payment.submittedBy.trim();
        existingPayment.remark = payment.remark ? payment.remark.trim() : '';
    } else {
        // Add new payment
        paymentsAccount.paymentsOut.push({
            referenceId,
            amount: parseFloat(payment.amount),
            date: payment.date ? new Date(payment.date) : new Date(),
            method: payment.method.trim(),
            submittedBy: payment.submittedBy.trim(),
            remark: payment.remark ? payment.remark.trim() : '',
        });
    }
}

// Handle removed payments
const newPaymentIds = payments.map((payment) => payment.referenceId);
paymentsAccount.paymentsOut = paymentsAccount.paymentsOut.filter(
    (existingPayment) => newPaymentIds.includes(existingPayment.referenceId)
);

await paymentsAccount.save({ session });

        }

        // // Handle removed payments in PaymentsAccount
        // for (const payment of removedPayments) {
        //   const paymentsAccount = await PaymentsAccount.findOne({ accountId: payment.method.trim() }).session(session);
        //   if (paymentsAccount) {
        //     paymentsAccount.paymentsOut = paymentsAccount.paymentsOut.filter(
        //       (p) =>
        //         !(
        //           p.amount === payment.amount &&
        //           p.date.getTime() === payment.date.getTime() &&
        //           p.submittedBy === payment.submittedBy &&
        //           p.remark === (payment.remark ? payment.remark.trim() : '')
        //         )
        //     );
        //     await paymentsAccount.save({ session });
        //   }
        // }
      }

      // Save the updated documents
      await account.save({ session });
      await sellerPayment.save({ session });

      await session.commitTransaction();
      session.endSession();

      res.json({ message: 'Supplier account updated successfully', account });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();

      console.error('Error updating supplier account:', error);

      // Handle duplicate key errors (e.g., duplicate supplierId or accountId)
      if (error.code === 11000) {
        const duplicateField = Object.keys(error.keyPattern)[0];
        return res.status(400).json({ message: `${duplicateField} must be unique.` });
      }

      res.status(500).json({ message: 'Server Error', error: error.message });
    }
  }
);




supplierRouter.get('/daily/payments', async (req, res) => {
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
    let suppliers = [];

    // Aggregation pipeline
     suppliers = await SupplierAccount.aggregate([
      { $unwind: '$payments' },
      {
        $match: {
          'payments.date': { $gte: start, $lte: end },
        },
      },
      {
        $group: {
          _id: '$sellerId',
          sellerName: { $first: '$sellerName' },
          payments: { $push: '$payments' },
        },
      },
      {
        $sort: { sellerName: 1 }, // Optional: Sort suppliers alphabetically
      },
    ]);

    // Check if any suppliers have payments in the date range
    // if (!suppliers || suppliers.length === 0) {
    //   return res.status(404).json({ message: 'No supplier payments found within the specified date range.' });
    // }

    res.json(suppliers);
  } catch (error) {
    console.error('Error fetching supplier payments:', error);
    res.status(500).json({ message: 'Internal Server Error while fetching supplier payments.' });
  }
});


export default supplierRouter;
