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
        sellerGst,
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
        sellerGst : sellerGst.trim(),
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

      // **Update basic fields**
      if (supplierName !== undefined) {
        account.sellerName = supplierName.trim();
        sellerPayment.sellerName = supplierName.trim();
      }

      if (supplierAddress !== undefined) {
        account.sellerAddress = supplierAddress.trim();
      }

      if (supplierId !== undefined && supplierId.trim() !== account.sellerId) {
        // Update sellerId in both account and sellerPayment
        account.sellerId = supplierId.trim();
        sellerPayment.sellerId = supplierId.trim();
      }

      // **Handle Bills**
      if (bills !== undefined) {
        // Check for duplicate invoice numbers within the provided bills
        const invoiceNos = bills.map((bill) => bill.invoiceNo.trim());
        const uniqueInvoiceNos = new Set(invoiceNos);
        if (invoiceNos.length !== uniqueInvoiceNos.size) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ message: 'Duplicate invoice numbers are not allowed within bills.' });
        }

        const existingInvoiceNos = account.bills.map((bill) => bill.invoiceNo);
        const newInvoiceNos = invoiceNos;

        // Determine added and removed bills
        const addedBills = bills.filter((bill) => !existingInvoiceNos.includes(bill.invoiceNo.trim()));
        const removedBills = account.bills.filter((bill) => !newInvoiceNos.includes(bill.invoiceNo));

        // Update bills in SupplierAccount
        account.bills = bills.map((bill) => ({
          invoiceNo: bill.invoiceNo.trim(),
          billAmount: parseFloat(bill.billAmount),
          invoiceDate: bill.invoiceDate ? new Date(bill.invoiceDate) : undefined,
        }));

        // Update billings in SellerPayment
        // Remove old bills from sellerPayment that are no longer present
        sellerPayment.billings = sellerPayment.billings.filter(
          (billing) => !removedBills.some((rb) => rb.invoiceNo === billing.invoiceNo)
        );

        // Add newly added bills to sellerPayment
        for (const bill of addedBills) {
          sellerPayment.billings.push({
            amount: parseFloat(bill.billAmount),
            date: bill.invoiceDate ? new Date(bill.invoiceDate) : new Date(),
            invoiceNo: bill.invoiceNo.trim(),
          });
        }
      }

      // **Handle Payments**
      // We'll assume that each payment may have an _id if it's an existing payment,
      // otherwise it's new. Also, we want to track payments by a referenceId across models.
      // If a payment doesn't have a referenceId, we'll generate one for new payments.

      // Map existing payments in account by their _id for comparison
      const existingPaymentsMap = new Map(account.payments.map((p) => [p._id.toString(), p]));

      // Prepare arrays
      const finalPayments = [];       // final updated list of payments for the account/sellerPayment
      const removedPayments = [];     // payments that are no longer in the updated array
      const newOrUpdatedPayments = []; // payments that are new or updated

      // We'll need to identify removed payments:
      const incomingIds = payments
        .filter((p) => p._id)
        .map((p) => p._id.toString());
      for (const oldPayment of account.payments) {
        if (!incomingIds.includes(oldPayment._id.toString())) {
          // This payment was removed
          removedPayments.push(oldPayment);
        }
      }

      // Now handle incoming payments (new or updated)
      for (const payment of payments) {
        let existingPayment = null;
        let referenceId = payment.referenceId;

        if (payment._id && existingPaymentsMap.has(payment._id.toString())) {
          // This is an update to an existing payment
          existingPayment = existingPaymentsMap.get(payment._id.toString());
          // Keep the same referenceId if exists
          referenceId = existingPayment.referenceId || referenceId;
        }

        // If no referenceId yet, generate a new one
        if (!referenceId) {
          referenceId = 'PAY' + Date.now().toString() + Math.floor(Math.random() * 1000);
        }

        const updatedPayment = {
          _id: (existingPayment && existingPayment._id) || new mongoose.Types.ObjectId(),
          amount: parseFloat(payment.amount),
          date: payment.date ? new Date(payment.date) : new Date(),
          method: payment.method.trim(),
          submittedBy: payment.submittedBy.trim(),
          remark: payment.remark ? payment.remark.trim() : '',
          referenceId: referenceId,
        };

        finalPayments.push(updatedPayment);
        newOrUpdatedPayments.push(updatedPayment);
      }

      // Update SupplierAccount and SellerPayment payments arrays
      account.payments = finalPayments;
      sellerPayment.payments = finalPayments.map((p) => {
        return {
          amount: p.amount,
          date: p.date,
          method: p.method,
          submittedBy: p.submittedBy,
          remark: p.remark,
          referenceId: p.referenceId,
        };
      });

      // **Update PaymentsAccount for each payment method**
      // We need to reflect the final state of payments in PaymentsAccount.
      // For each unique payment method, find the corresponding PaymentsAccount and
      // update it with the final set of payments that match that method.
      
      // Group finalPayments by method
      const paymentsByMethod = {};
      for (const p of finalPayments) {
        if (!paymentsByMethod[p.method]) paymentsByMethod[p.method] = [];
        paymentsByMethod[p.method].push(p);
      }

      // For each method, update the corresponding PaymentsAccount
      for (const method of Object.keys(paymentsByMethod)) {
        const methodPayments = paymentsByMethod[method];
        const paymentsAccount = await PaymentsAccount.findOne({ accountId: method.trim() }).session(session);
        if (!paymentsAccount) {
          await session.abortTransaction();
          session.endSession();
          return res.status(404).json({ message: `Payment account ${method.trim()} not found` });
        }

        // Map existing paymentsOut by referenceId
        const existingPaymentsOutMap = new Map(paymentsAccount.paymentsOut.map((po) => [po.referenceId, po]));

        // Build a new array of paymentsOut that reflect the final state of all payments for this method
        const updatedPaymentsOut = [];

        for (const p of methodPayments) {
          if (existingPaymentsOutMap.has(p.referenceId)) {
            // Update existing paymentOut
            const existingPo = existingPaymentsOutMap.get(p.referenceId);
            existingPo.amount = p.amount;
            existingPo.date = p.date;
            existingPo.method = p.method;
            existingPo.submittedBy = p.submittedBy;
            existingPo.remark = p.remark;
            updatedPaymentsOut.push(existingPo);
          } else {
            // Add new paymentOut
            updatedPaymentsOut.push({
              referenceId: p.referenceId,
              amount: p.amount,
              date: p.date,
              method: p.method,
              submittedBy: p.submittedBy,
              remark: p.remark,
            });
          }
        }

        // Now we must also ensure that any paymentsOut that belonged to this account but are not in finalPayments are removed.
        // This means removing paymentsOut whose referenceId is not present in updatedPaymentsOut.
        const finalReferenceIds = new Set(updatedPaymentsOut.map((po) => po.referenceId));
        paymentsAccount.paymentsOut = paymentsAccount.paymentsOut.filter(
          (po) => po.method !== method.trim() || finalReferenceIds.has(po.referenceId)
        );

        // Insert or update the updatedPaymentsOut into paymentsOut 
        // (They are already in updated form, so we can just merge)
        // Some of them are updated in place. To ensure no duplicates:
        for (const updatedPo of updatedPaymentsOut) {
          const index = paymentsAccount.paymentsOut.findIndex((po) => po.referenceId === updatedPo.referenceId);
          if (index > -1) {
            paymentsAccount.paymentsOut[index] = updatedPo;
          } else {
            paymentsAccount.paymentsOut.push(updatedPo);
          }
        }

        await paymentsAccount.save({ session });
      }

      // Commit changes to account and sellerPayment
      await account.save({ session });
      await sellerPayment.save({ session });

      await session.commitTransaction();
      session.endSession();

      res.json({ message: 'Supplier account updated successfully', account });
    } catch (error) {
      await session.abortTransaction();
      session.endSession();

      console.error('Error updating supplier account:', error);

      // Handle duplicate key errors (e.g., duplicate supplierId)
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

    // Fetch supplier payments within the date range
    const suppliers = await SupplierAccount.aggregate([
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
          payments: { $push: {
            amount: '$payments.amount',
            date: '$payments.date',
            method: '$payments.method',
            submittedBy: '$payments.submittedBy',
            remark: '$payments.remark',
          }},
        },
      },
      {
        $sort: { sellerName: 1 }, // Optional: Sort suppliers alphabetically
      },
    ]);

    res.json(suppliers);
  } catch (error) {
    console.error('Error fetching supplier payments:', error);
    res.status(500).json({ message: 'Internal Server Error while fetching supplier payments.' });
  }
});



export default supplierRouter;
