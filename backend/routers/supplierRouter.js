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
supplierRouter.post('/create', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      sellerName,
      bills,
      payments,
      sellerAddress,
      sellerGst,
      sellerId,
    } = req.body;

    // Validate required fields
    if (
      !sellerName ||
      !sellerId ||
      !sellerAddress ||
      !sellerGst ||
      !Array.isArray(bills) ||
      bills.length === 0
    ) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Missing required fields.' });
    }

    // Check for duplicate invoice numbers within the bills
    const invoiceNos = bills.map((bill) => bill.invoiceNo.trim());
    const uniqueInvoiceNos = new Set(invoiceNos);
    if (invoiceNos.length !== uniqueInvoiceNos.size) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ message: 'Duplicate invoice numbers are not allowed within bills.' });
    }

    // Create a new SupplierAccount instance
    const newSupplierAccount = new SupplierAccount({
      sellerId: sellerId.trim(),
      sellerName: sellerName.trim(),
      sellerAddress: sellerAddress.trim(),
      sellerGst: sellerGst.trim(),
      bills: bills.map((bill) => ({
        invoiceNo: bill.invoiceNo.trim(),
        billAmount: parseFloat(bill.billAmount),
        invoiceDate: bill.invoiceDate ? new Date(bill.invoiceDate) : undefined,
      })),
      payments: [], // Initialize as empty; will add payments below if any
    });

    // Save the new SupplierAccount
    const savedSupplierAccount = await newSupplierAccount.save({ session });

    // Initialize variables for SellerPayment
    let sellerPayment = await SellerPayment.findOne({ sellerId: sellerId.trim() }).session(session);

    // If SellerPayment does not exist, create one
    if (!sellerPayment) {
      sellerPayment = new SellerPayment({
        sellerId: sellerId.trim(),
        sellerName: sellerName.trim(),
        billings: [],
        payments: [],
      });
    }

    // Add bills to SellerPayment
    const billingEntries = bills.map((bill) => ({
      amount: parseFloat(bill.billAmount),
      date: bill.invoiceDate ? new Date(bill.invoiceDate) : new Date(),
      invoiceNo: bill.invoiceNo.trim(),
    }));
    sellerPayment.billings.push(...billingEntries);

    // Handle Payments if present
    if (payments && Array.isArray(payments) && payments.length > 0 && payments[0].amount > 0) {
      for (const payment of payments) {
        // Validate payment fields
        if (
          !payment.amount ||
          typeof payment.amount !== 'number' ||
          payment.amount <= 0 ||
          !payment.method ||
          !payment.submittedBy
        ) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ message: 'Invalid payment details provided.' });
        }

        // Create a unique paymentReferenceId
        const paymentReferenceId = 'PAY' + Date.now().toString() + Math.floor(Math.random() * 1000);

        // Prepare payment entry for SupplierAccount
        const paymentEntry = {
          amount: parseFloat(payment.amount),
          date: payment.date ? new Date(payment.date) : new Date(),
          method: payment.method.trim(),
          submittedBy: payment.submittedBy.trim(),
          remark: payment.remark ? payment.remark.trim() : '',
          referenceId: paymentReferenceId,
        };

        // Add payment to SupplierAccount
        savedSupplierAccount.payments.push(paymentEntry);

        // Update PaymentsAccount
        // const paymentsAccount = await PaymentsAccount.findOne({ accountId: payment.method.trim() }).session(session);
        // if (!paymentsAccount) {
        //   await session.abortTransaction();
        //   session.endSession();
        //   return res.status(404).json({ message: `Payment account ${payment.method.trim()} not found.` });
        // }

        // // Add payment out entry to PaymentsAccount
        // paymentsAccount.paymentsOut.push({
        //   amount: parseFloat(payment.amount),
        //   method: payment.method.trim(),
        //   remark: `Payment to supplier ${savedSupplierAccount.sellerName}`,
        //   submittedBy: payment.submittedBy.trim(),
        //   referenceId: paymentReferenceId,
        //   date: payment.date ? new Date(payment.date) : new Date(),
        // });

        // // Save updated PaymentsAccount
        // await paymentsAccount.save({ session });

        // Prepare payment entry for SellerPayment
        const sellerPaymentEntry = {
          amount: parseFloat(payment.amount),
          date: payment.date ? new Date(payment.date) : new Date(),
          method: payment.method.trim(),
          submittedBy: payment.submittedBy.trim(),
          referenceId: paymentReferenceId,
          remark: payment.remark ? payment.remark.trim() : '',
        };

        // Add payment to SellerPayment
        sellerPayment.payments.push(sellerPaymentEntry);
      }
    }

    // Save the updated SupplierAccount
    await savedSupplierAccount.save({ session });

    // Save the updated SellerPayment
    await sellerPayment.save({ session });

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    // Respond with the saved SupplierAccount
    res.status(201).json(savedSupplierAccount);
  } catch (error) {
    // Abort the transaction in case of error
    await session.abortTransaction();
    session.endSession();

    console.error('Error creating supplier account:', error);

    // Handle duplicate key errors (e.g., duplicate sellerId)
    if (error.code === 11000) {
      const duplicateField = Object.keys(error.keyPattern)[0];
      return res.status(400).json({ message: `${duplicateField} must be unique.` });
    }

    res.status(500).json({ message: 'Server Error' });
  }
});

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
    // Validation Middlewares
    body('supplierName')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Supplier Name cannot be empty'),
    body('supplierAddress')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Supplier Address cannot be empty'),
    body('sellerGst')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Seller GST cannot be empty'),
    body('supplierId')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Supplier ID cannot be empty'),
    body('bills')
      .optional()
      .isArray()
      .withMessage('Bills must be an array'),
    body('bills.*.invoiceNo')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Invoice Number is required for each bill'),
    body('bills.*.billAmount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Bill Amount must be a positive number'),
    body('bills.*.invoiceDate')
      .optional()
      .isISO8601()
      .toDate()
      .withMessage('Invalid Invoice Date'),
    body('payments')
      .optional()
      .isArray()
      .withMessage('Payments must be an array'),
    body('payments.*.referenceId')
      .optional()
      .trim(),
    body('payments.*.amount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Payment Amount must be a positive number'),
    body('payments.*.submittedBy')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Submitted By is required for each payment'),
    body('payments.*.method')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Payment method is required'),
    body('payments.*.date')
      .optional()
      .isISO8601()
      .toDate()
      .withMessage('Invalid Payment Date'),
    body('payments.*.remark')
      .optional()
      .trim(),
    // Add any additional validations as needed
  ],
  async (req, res) => {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Handle validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ errors: errors.array() });
      }

      const {
        supplierName,
        supplierAddress,
        sellerGst,
        supplierId,
        bills,
        payments,
      } = req.body;

      // Fetch the SupplierAccount by ID
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

      // Update Basic Fields in SupplierAccount and SellerPayment
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
        supplierAccount.sellerId = supplierId.trim();
        sellerPayment.sellerId = supplierId.trim();
        // Additional logic may be needed if sellerId changes significantly
      }

      // === Handle Bills ===
      if (bills !== undefined) {
        // Check for duplicate invoice numbers within the provided bills
        const invoiceNos = bills.map((bill) => bill.invoiceNo.trim());
        const uniqueInvoiceNos = new Set(invoiceNos);
        if (invoiceNos.length !== uniqueInvoiceNos.size) {
          throw { status: 400, message: 'Duplicate invoice numbers are not allowed within bills.' };
        }

        // Update bills in SupplierAccount
        supplierAccount.bills = bills.map((bill) => ({
          invoiceNo: bill.invoiceNo.trim(),
          billAmount: parseFloat(bill.billAmount),
          invoiceDate: bill.invoiceDate ? new Date(bill.invoiceDate) : undefined,
        }));

        // Update billings in SellerPayment
        // Remove old bills from sellerPayment that are no longer present
        const updatedInvoiceNos = new Set(invoiceNos);
        sellerPayment.billings = sellerPayment.billings.filter(
          (billing) => updatedInvoiceNos.has(billing.invoiceNo)
        );

        // Add newly added bills to sellerPayment
        for (const bill of bills) {
          const exists = sellerPayment.billings.some((b) => b.invoiceNo === bill.invoiceNo.trim());
          if (!exists) {
            sellerPayment.billings.push({
              amount: parseFloat(bill.billAmount),
              date: bill.invoiceDate ? new Date(bill.invoiceDate) : new Date(),
              invoiceNo: bill.invoiceNo.trim(),
            });
          }
        }
      }

      // === Handle Payments ===
      if (payments !== undefined) {
        // Fetch existing payments from SupplierAccount
        const existingPayments = supplierAccount.payments.map((p) => ({
          ...p.toObject(),
        }));

        // Map existing payments by referenceId for easy lookup
        const existingPaymentsMap = new Map(existingPayments.map((p) => [p.referenceId, p]));

        // Prepare to track changes
        const paymentsToAdd = [];
        const paymentsToUpdate = [];
        const paymentsToRemove = [];

        // Process incoming payments
        for (const payment of payments) {
          const {
            referenceId: incomingRefId,
            amount,
            date,
            submittedBy,
            remark,
            method,
            invoiceNo,
          } = payment;

          // Sanitize inputs
          const sanitizedMethod = method ? method.trim() : 'Cash';
          const sanitizedInvoiceNo = invoiceNo ? invoiceNo.trim() : '';
          const sanitizedSubmittedBy = submittedBy ? submittedBy.trim() : '';
          const parsedAmount = parseFloat(amount);

          // Generate a referenceId if not provided
          let referenceId = incomingRefId;
          if (!referenceId) {
            referenceId = 'PAY' + Date.now().toString();
          }

          const existingPayment = existingPaymentsMap.get(referenceId);

          if (existingPayment) {
            // === Updating an Existing Payment ===
            const oldMethod = existingPayment.method;

            // Check if method has changed
            const isMethodChanged = sanitizedMethod !== oldMethod;

            // Check if other fields have changed
            const isAmountChanged = parsedAmount !== existingPayment.amount;
            const isDateChanged = date ? new Date(date).getTime() !== new Date(existingPayment.date).getTime() : false;
            const isRemarkChanged = remark ? remark.trim() !== existingPayment.remark : existingPayment.remark !== '';
            const isSubmittedByChanged = sanitizedSubmittedBy !== existingPayment.submittedBy;
            const isInvoiceNoChanged = sanitizedInvoiceNo !== existingPayment.invoiceNo;

            if (isMethodChanged || isAmountChanged || isDateChanged || isRemarkChanged || isSubmittedByChanged || isInvoiceNoChanged) {
              paymentsToUpdate.push({
                referenceId,
                amount: parsedAmount,
                date: date ? new Date(date) : existingPayment.date,
                submittedBy: sanitizedSubmittedBy,
                remark: remark ? remark.trim() : '',
                method: sanitizedMethod,
                invoiceNo: sanitizedInvoiceNo || existingPayment.invoiceNo,
                original: existingPayment,
              });
            }

            // Remove from existingPaymentsMap to identify remaining as toRemove
            existingPaymentsMap.delete(referenceId);
          } else {
            // New payment to add
            paymentsToAdd.push({
              referenceId,
              amount: parsedAmount,
              date: date ? new Date(date) : new Date(),
              submittedBy: sanitizedSubmittedBy,
              remark: remark ? remark.trim() : '',
              method: sanitizedMethod,
              invoiceNo: sanitizedInvoiceNo,
            });
          }
        }

        // Remaining payments in existingPaymentsMap are to be removed
        for (const [refId, payment] of existingPaymentsMap.entries()) {
          paymentsToRemove.push(payment);
        }

        // === Update SupplierAccount Payments ===
        // Remove payments
        supplierAccount.payments = supplierAccount.payments.filter(
          (p) => !paymentsToRemove.some((rm) => rm.referenceId === p.referenceId)
        );

        // Update existing payments
        for (const paymentUpdate of paymentsToUpdate) {
          const index = supplierAccount.payments.findIndex((p) => p.referenceId === paymentUpdate.referenceId);
          if (index !== -1) {
            supplierAccount.payments[index].amount = paymentUpdate.amount;
            supplierAccount.payments[index].date = paymentUpdate.date;
            supplierAccount.payments[index].submittedBy = paymentUpdate.submittedBy;
            supplierAccount.payments[index].remark = paymentUpdate.remark;
            supplierAccount.payments[index].method = paymentUpdate.method;
            supplierAccount.payments[index].invoiceNo = paymentUpdate.invoiceNo;
          }
        }

        // Add new payments
        for (const newPayment of paymentsToAdd) {
          supplierAccount.payments.push({
            _id: new mongoose.Types.ObjectId(),
            amount: newPayment.amount,
            date: newPayment.date,
            submittedBy: newPayment.submittedBy,
            remark: newPayment.remark,
            method: newPayment.method,
            invoiceNo: newPayment.invoiceNo,
            referenceId: newPayment.referenceId,
          });
        }

        // === Update SellerPayment Payments ===
        // Remove payments
        sellerPayment.payments = sellerPayment.payments.filter(
          (p) => !paymentsToRemove.some((rm) => rm.referenceId === p.referenceId)
        );

        // Update existing payments
        for (const paymentUpdate of paymentsToUpdate) {
          const spIndex = sellerPayment.payments.findIndex(
            (p) => p.referenceId === paymentUpdate.referenceId
          );
          if (spIndex !== -1) {
            sellerPayment.payments[spIndex].amount = paymentUpdate.amount;
            sellerPayment.payments[spIndex].date = paymentUpdate.date;
            sellerPayment.payments[spIndex].submittedBy = paymentUpdate.submittedBy;
            sellerPayment.payments[spIndex].remark = paymentUpdate.remark;
            sellerPayment.payments[spIndex].method = paymentUpdate.method;
            sellerPayment.payments[spIndex].invoiceNo = paymentUpdate.invoiceNo;
          }
        }

        // Add new payments
        for (const newPayment of paymentsToAdd) {
          sellerPayment.payments.push({
            amount: newPayment.amount,
            date: newPayment.date,
            submittedBy: newPayment.submittedBy,
            remark: newPayment.remark,
            method: newPayment.method,
            invoiceNo: newPayment.invoiceNo,
            referenceId: newPayment.referenceId,
          });
        }

        // === Handle PaymentsAccount Updates ===
        /**
         * To ensure data consistency:
         * - For payments to add: Add to the corresponding PaymentsAccount's paymentsOut
         * - For payments to update:
         *    - If method changed: Remove from old PaymentsAccount and add to new PaymentsAccount
         *    - If only amount or other fields changed: Update in the existing PaymentsAccount's paymentsOut
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
          const { referenceId, method, amount, date, submittedBy, remark, invoiceNo, original } = paymentUpdate;

          // Check if method has changed
          if (method !== original.method) {
            // Remove from old PaymentsAccount
            const oldPaymentsAccount = await PaymentsAccount.findOne({ accountId: original.method }).session(session);
            if (oldPaymentsAccount) {
              oldPaymentsAccount.paymentsOut = oldPaymentsAccount.paymentsOut.filter(
                (po) => po.referenceId !== referenceId
              );
              await oldPaymentsAccount.save({ session });
            }

            // Add to new PaymentsAccount
            const newPaymentsAccount = await PaymentsAccount.findOne({ accountId: method }).session(session);
            if (!newPaymentsAccount) {
              throw { status: 404, message: `PaymentsAccount with accountId ${method} not found.` };
            }

            newPaymentsAccount.paymentsOut.push({
              amount,
              date,
              method,
              submittedBy,
              remark,
              referenceId,
            });

            await newPaymentsAccount.save({ session });
          } else {
            // Method hasn't changed, update the existing PaymentsAccount's paymentsOut
            const paymentsAccount = await PaymentsAccount.findOne({ accountId: method }).session(session);
            if (paymentsAccount) {
              const paymentOut = paymentsAccount.paymentsOut.find((po) => po.referenceId === referenceId);
              if (paymentOut) {
                // Update only if necessary
                let needsUpdate = false;

                if (amount !== paymentOut.amount) needsUpdate = true;
                if (date && new Date(date).getTime() !== new Date(paymentOut.date).getTime()) needsUpdate = true;
                if (remark && remark.trim() !== paymentOut.remark) needsUpdate = true;
                if (submittedBy && submittedBy.trim() !== paymentOut.submittedBy) needsUpdate = true;

                if (needsUpdate) {
                  paymentOut.amount = amount;
                  paymentOut.date = date ? new Date(date) : paymentOut.date;
                  paymentOut.submittedBy = submittedBy.trim();
                  paymentOut.remark = remark ? remark.trim() : paymentOut.remark;
                  // method remains the same

                  await paymentsAccount.save({ session });
                }
              } else {
                // If the paymentOut doesn't exist, it's a critical inconsistency
                throw { status: 500, message: `PaymentOut with referenceId ${referenceId} not found in PaymentsAccount ${method}.` };
              }
            } else {
              throw { status: 404, message: `PaymentsAccount with accountId ${method} not found.` };
            }
          }

          // === Optional: Handle InvoiceNo Changes in Billing Documents ===
          // Since the user requested to remove billing modal updation, this section is omitted.
          // If needed, similar logic can be implemented here.
        }

        // Process additions
        for (const newPayment of paymentsToAdd) {
          const { referenceId, method, amount, date, submittedBy, remark, invoiceNo } = newPayment;

          // Add to PaymentsAccount
          const paymentsAccount = await PaymentsAccount.findOne({ accountId: method }).session(session);
          if (!paymentsAccount) {
            throw { status: 404, message: `PaymentsAccount with accountId ${method} not found.` };
          }

          paymentsAccount.paymentsOut.push({
            amount,
            method,
            submittedBy,
            remark,
            date,
            referenceId,
          });

          await paymentsAccount.save({ session });
        }

        // Remove any payments that are no longer in the updated list
        for (const payment of paymentsToRemove) {
          // Since billing modal updation is removed, we do not handle Billing documents here
          // If needed, additional logic can be added
        }

        // === Recalculate Totals ===
        supplierAccount.totalBillAmount = supplierAccount.bills.reduce(
          (acc, bill) => acc + (bill.billAmount || 0),
          0
        );
        supplierAccount.paidAmount = supplierAccount.payments.reduce(
          (acc, payment) => acc + (payment.amount || 0),
          0
        );
        supplierAccount.pendingAmount = supplierAccount.totalBillAmount - supplierAccount.paidAmount;

        if (supplierAccount.pendingAmount < 0) {
          throw { status: 400, message: 'Paid amount exceeds total bill amount' };
        }

        // === Update PaymentAccounts balances ===
        const paymentAccounts = await PaymentsAccount.find({}).session(session);
        for (const pa of paymentAccounts) {
          const totalIn = pa.paymentsIn.reduce(
            (acc, payment) => acc + (payment.amount || 0),
            0
          );
          const totalOut = pa.paymentsOut.reduce(
            (acc, payment) => acc + (payment.amount || 0),
            0
          );
          pa.balanceAmount = totalIn - totalOut;
          await pa.save({ session });
        }

        // === Save Updated Documents ===
        await supplierAccount.save({ session });
        await sellerPayment.save({ session });

        // === Commit Transaction ===
        await session.commitTransaction();
        session.endSession();

        res.status(200).json({ message: 'Supplier account updated successfully.', account: supplierAccount });
      } 
    }catch (error) {
        console.error('Error updating supplier account:', error);

        // Abort the transaction on error
        if (session.inTransaction()) {
          await session.abortTransaction();
        }
        session.endSession();

        // Handle custom errors
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
