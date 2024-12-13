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
    body('sellerGst').optional().trim(), // Assuming sellerGst might be updated
  ],
  async (req, res) => {
    // Validate Request
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      const {
        supplierName,
        bills,
        payments,
        supplierAddress,
        supplierId,
        sellerGst, // Include sellerGst if it's part of the update
      } = req.body;

      // Fetch the SupplierAccount
      const supplierAccount = await SupplierAccount.findById(req.params.id).session(session);
      if (!supplierAccount) {
        throw { status: 404, message: 'Supplier Account not found' };
      }

      // Fetch or Create the SellerPayment
      let sellerPayment = await SellerPayment.findOne({ sellerId: supplierAccount.sellerId }).session(session);
      if (!sellerPayment) {
        sellerPayment = new SellerPayment({
          sellerId: supplierAccount.sellerId,
          sellerName: supplierAccount.sellerName,
          billings: [],
          payments: [],
        });
      }

      // Update Basic Fields
      if (supplierName !== undefined) {
        supplierAccount.sellerName = supplierName.trim();
        sellerPayment.sellerName = supplierName.trim();
      }

      if (supplierAddress !== undefined) {
        supplierAccount.sellerAddress = supplierAddress.trim();
      }

      if (sellerGst !== undefined) {
        supplierAccount.sellerGst = sellerGst.trim();
      }

      if (supplierId !== undefined && supplierId.trim() !== supplierAccount.sellerId) {
        // Update sellerId in both SupplierAccount and SellerPayment
        const oldSellerId = supplierAccount.sellerId;
        supplierAccount.sellerId = supplierId.trim();
        sellerPayment.sellerId = supplierId.trim();

        // Additional logic may be needed if sellerId changes significantly
      }

      // --- Handle Bills ---
      if (bills !== undefined) {
        // Check for duplicate invoice numbers within the provided bills
        const invoiceNos = bills.map((bill) => bill.invoiceNo.trim());
        const uniqueInvoiceNos = new Set(invoiceNos);
        if (invoiceNos.length !== uniqueInvoiceNos.size) {
          throw { status: 400, message: 'Duplicate invoice numbers are not allowed within bills.' };
        }

        const existingInvoiceNos = supplierAccount.bills.map((bill) => bill.invoiceNo);
        const newInvoiceNos = invoiceNos;

        // Determine added and removed bills
        const addedBills = bills.filter((bill) => !existingInvoiceNos.includes(bill.invoiceNo.trim()));
        const removedBills = supplierAccount.bills.filter((bill) => !newInvoiceNos.includes(bill.invoiceNo));

        // Update bills in SupplierAccount
        supplierAccount.bills = bills.map((bill) => ({
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

      // --- Handle Payments ---
      // Fetch existing payments from SupplierAccount
      const existingPayments = supplierAccount.payments.map((p) => ({
        ...p.toObject(),
      }));

      // Map existing payments by _id for easy lookup
      const existingPaymentsMap = new Map(existingPayments.map((p) => [p._id.toString(), p]));

      // Prepare to track changes
      const paymentsToAdd = [];
      const paymentsToUpdate = [];
      const paymentsToRemove = [];

      // Process incoming payments
      for (const payment of payments) {
        if (payment._id) {
          // Existing payment, check if it needs to be updated
          const existingPayment = existingPaymentsMap.get(payment._id.toString());
          if (existingPayment) {
            // Check for changes in amount or method
            const isAmountChanged = parseFloat(payment.amount) !== existingPayment.amount;
            const isMethodChanged = payment.method.trim() !== existingPayment.method;

            if (isAmountChanged || isMethodChanged) {
              paymentsToUpdate.push({
                ...payment,
                original: existingPayment,
              });
            }

            // Remove from existingPaymentsMap to identify remaining as toRemove
            existingPaymentsMap.delete(payment._id.toString());
          } else {
            // Payment _id provided but not found in existing payments
            throw { status: 400, message: `Payment with ID ${payment._id} not found.` };
          }
        } else {
          // New payment to add
          paymentsToAdd.push(payment);
        }
      }

      // Remaining payments in existingPaymentsMap are to be removed
      for (const [id, payment] of existingPaymentsMap.entries()) {
        paymentsToRemove.push(payment);
      }

      // --- Update SupplierAccount Payments ---
      // Remove payments
      supplierAccount.payments = supplierAccount.payments.filter(
        (p) => !paymentsToRemove.some((rm) => rm._id.toString() === p._id.toString())
      );

      // Update payments
      for (const paymentUpdate of paymentsToUpdate) {
        const index = supplierAccount.payments.findIndex((p) => p._id.toString() === paymentUpdate._id.toString());
        if (index !== -1) {
          supplierAccount.payments[index].amount = parseFloat(paymentUpdate.amount);
          supplierAccount.payments[index].date = paymentUpdate.date ? new Date(paymentUpdate.date) : new Date();
          supplierAccount.payments[index].method = paymentUpdate.method.trim();
          supplierAccount.payments[index].submittedBy = paymentUpdate.submittedBy.trim();
          supplierAccount.payments[index].remark = paymentUpdate.remark ? paymentUpdate.remark.trim() : '';
        }
      }

      // Add new payments
      for (const newPayment of paymentsToAdd) {
        const referenceId = newPayment.referenceId
          ? newPayment.referenceId
          : 'PAY' + Date.now().toString() + Math.floor(Math.random() * 1000);

        supplierAccount.payments.push({
          _id: new mongoose.Types.ObjectId(),
          amount: parseFloat(newPayment.amount),
          date: newPayment.date ? new Date(newPayment.date) : new Date(),
          method: newPayment.method.trim(),
          submittedBy: newPayment.submittedBy.trim(),
          remark: newPayment.remark ? newPayment.remark.trim() : '',
          referenceId: referenceId,
        });
      }

      // --- Update SellerPayment Payments ---
      // Remove payments
      sellerPayment.payments = sellerPayment.payments.filter(
        (p) => !paymentsToRemove.some((rm) => rm.referenceId === p.referenceId)
      );

      // Update payments
      for (const paymentUpdate of paymentsToUpdate) {
        const spIndex = sellerPayment.payments.findIndex(
          (p) => p.referenceId === paymentUpdate.original.referenceId
        );
        if (spIndex !== -1) {
          sellerPayment.payments[spIndex].amount = parseFloat(paymentUpdate.amount);
          sellerPayment.payments[spIndex].date = paymentUpdate.date ? new Date(paymentUpdate.date) : new Date();
          sellerPayment.payments[spIndex].method = paymentUpdate.method.trim();
          sellerPayment.payments[spIndex].submittedBy = paymentUpdate.submittedBy.trim();
          sellerPayment.payments[spIndex].remark = paymentUpdate.remark ? paymentUpdate.remark.trim() : '';
        }
      }

      // Add new payments to SellerPayment
      for (const newPayment of paymentsToAdd) {
        const referenceId = newPayment.referenceId
          ? newPayment.referenceId
          : 'PAY' + Date.now().toString() + Math.floor(Math.random() * 1000);

        sellerPayment.payments.push({
          amount: parseFloat(newPayment.amount),
          date: newPayment.date ? new Date(newPayment.date) : new Date(),
          method: newPayment.method.trim(),
          submittedBy: newPayment.submittedBy.trim(),
          remark: newPayment.remark ? newPayment.remark.trim() : '',
          referenceId: referenceId,
        });
      }

      // --- Handle PaymentsAccount Updates ---
      /**
       * To ensure data consistency:
       * - For payments to add: Add to the corresponding PaymentsAccount's paymentsOut
       * - For payments to update:
       *    - If method changed: Remove from old PaymentsAccount and add to new PaymentsAccount
       *    - If amount changed: Update in the existing PaymentsAccount's paymentsOut
       * - For payments to remove: Remove from the corresponding PaymentsAccount's paymentsOut
       */

      // Process removals
      for (const payment of paymentsToRemove) {
        const paymentsAccount = await PaymentsAccount.findOne({ accountId: payment.method }).session(session);
        if (paymentsAccount) {
          paymentsAccount.paymentsOut = paymentsAccount.paymentsOut.filter(
            (po) => po.referenceId !== payment.referenceId
          );
          await paymentsAccount.save({ session });
        }
      }

      // Process updates
      for (const paymentUpdate of paymentsToUpdate) {
        const { original, ...updatedFields } = paymentUpdate;
        const referenceId = original.referenceId;

        // Check if method has changed
        if (paymentUpdate.method.trim() !== original.method) {
          // Remove from old PaymentsAccount
          const oldPaymentsAccount = await PaymentsAccount.findOne({ accountId: original.method }).session(session);
          if (oldPaymentsAccount) {
            oldPaymentsAccount.paymentsOut = oldPaymentsAccount.paymentsOut.filter(
              (po) => po.referenceId !== referenceId
            );
            await oldPaymentsAccount.save({ session });
          }

          // Add to new PaymentsAccount
          const newPaymentsAccount = await PaymentsAccount.findOne({ accountId: paymentUpdate.method.trim() }).session(session);
          if (!newPaymentsAccount) {
            throw { status: 404, message: `PaymentsAccount with accountId ${paymentUpdate.method.trim()} not found.` };
          }

          // Find the updated payment details
          const updatedPaymentDetails = payments.find((p) => p._id.toString() === paymentUpdate._id.toString());

          newPaymentsAccount.paymentsOut.push({
            amount: parseFloat(updatedPaymentDetails.amount),
            date: updatedPaymentDetails.date ? new Date(updatedPaymentDetails.date) : new Date(),
            method: updatedPaymentDetails.method.trim(),
            submittedBy: updatedPaymentDetails.submittedBy.trim(),
            remark: updatedPaymentDetails.remark ? updatedPaymentDetails.remark.trim() : '',
            referenceId: referenceId,
          });

          await newPaymentsAccount.save({ session });
        } else {
          // Method hasn't changed, update the existing PaymentsAccount
          const paymentsAccount = await PaymentsAccount.findOne({ accountId: paymentUpdate.method.trim() }).session(session);
          if (paymentsAccount) {
            const paymentOut = paymentsAccount.paymentsOut.find((po) => po.referenceId === referenceId);
            if (paymentOut) {
              paymentOut.amount = parseFloat(paymentUpdate.amount);
              paymentOut.date = paymentUpdate.date ? new Date(paymentUpdate.date) : new Date();
              paymentOut.method = paymentUpdate.method.trim();
              paymentOut.submittedBy = paymentUpdate.submittedBy.trim();
              paymentOut.remark = paymentUpdate.remark ? paymentUpdate.remark.trim() : '';
              await paymentsAccount.save({ session });
            } else {
              // If the paymentOut doesn't exist, it's a critical inconsistency
              throw { status: 500, message: `PaymentOut with referenceId ${referenceId} not found in PaymentsAccount ${paymentUpdate.method}.` };
            }
          } else {
            throw { status: 404, message: `PaymentsAccount with accountId ${paymentUpdate.method.trim()} not found.` };
          }
        }
      }

      // Process additions
      for (const newPayment of paymentsToAdd) {
        const referenceId = newPayment.referenceId
          ? newPayment.referenceId
          : 'PAY' + Date.now().toString() + Math.floor(Math.random() * 1000);

        const paymentsAccount = await PaymentsAccount.findOne({ accountId: newPayment.method.trim() }).session(session);
        if (!paymentsAccount) {
          throw { status: 404, message: `PaymentsAccount with accountId ${newPayment.method.trim()} not found.` };
        }

        paymentsAccount.paymentsOut.push({
          amount: parseFloat(newPayment.amount),
          date: newPayment.date ? new Date(newPayment.date) : new Date(),
          method: newPayment.method.trim(),
          submittedBy: newPayment.submittedBy.trim(),
          remark: newPayment.remark ? newPayment.remark.trim() : '',
          referenceId: referenceId,
        });

        await paymentsAccount.save({ session });
      }

      // --- Save Updated Documents ---
      await supplierAccount.save({ session });
      await sellerPayment.save({ session });

      // Commit Transaction
      await session.commitTransaction();
      session.endSession();

      res.json({ message: 'Supplier account updated successfully', account: supplierAccount });
    } catch (error) {
      // Abort Transaction
      await session.abortTransaction();
      session.endSession();

      console.error('Error updating supplier account:', error);

      // Custom error handling
      if (error.status && error.message) {
        return res.status(error.status).json({ message: error.message });
      }

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
