// routes/customerAccountcustomerRouter.js
import express from 'express';
import { body, validationResult } from 'express-validator';
import CustomerAccount from '../models/customerModal.js';
import PaymentsAccount from '../models/paymentsAccountModal.js';
import Billing from '../models/billingModal.js';
import mongoose from 'mongoose';

const customerRouter = express.Router();

/**
 * @route   POST /api/accounts/create
 * @desc    Create a new customer account
 * @access  Protected (Assuming authentication middleware is applied)
 */
customerRouter.post(
  '/create',
  [
    // Validation middleware using express-validator
    body('customerName').trim().notEmpty().withMessage('Customer Name is required'),
    body('bills').isArray().withMessage('Bills must be an array'),
    body('bills.*.invoiceNo')
      .trim()
      .notEmpty()
      .withMessage('Invoice Number is required for each bill'),
    body('bills.*.billAmount')
      .isFloat({ min: 0 })
      .withMessage('Bill Amount must be a positive number'),
    body('bills.*.invoiceDate')
      .optional()
      .isISO8601()
      .toDate()
      .withMessage('Invalid Invoice Date'),
    body('payments').isArray().withMessage('Payments must be an array'),
    body('payments.*.amount')
      .isFloat({ min: 0 })
      .withMessage('Payment Amount must be a positive number'),
    body('payments.*.submittedBy')
      .trim()
      .notEmpty()
      .withMessage('Submitted By is required for each payment'),
    body('payments.*.date')
      .optional()
      .isISO8601()
      .toDate()
      .withMessage('Invalid Payment Date'),
    // You can add more validations as needed
  ],
  async (req, res) => {
    // Handle validation errors
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // Return the first validation error
      return res.status(400).json({ message: errors.array()[0].msg });
    }

    try {
      const { customerName, bills, payments, userId, customerContactNumber } = req.body;

      // Check if there are duplicate invoice numbers within the bills
      const invoiceNos = bills.map((bill) => bill.invoiceNo.trim());
      const uniqueInvoiceNos = new Set(invoiceNos);
      if (invoiceNos.length !== uniqueInvoiceNos.size) {
        return res.status(400).json({ message: 'Duplicate invoice numbers are not allowed.' });
      }

      // Create a new CustomerAccount instance
      const newCustomerAccount = new CustomerAccount({
        customerName: customerName.trim(),
        customerContactNumber,
        bills: bills.map((bill) => ({
          invoiceNo: bill.invoiceNo.trim(),
          billAmount: parseFloat(bill.billAmount),
          invoiceDate: bill.invoiceDate ? new Date(bill.invoiceDate) : undefined,
        })),
        payments: payments.map((payment) => ({
          amount: parseFloat(payment.amount),
          date: payment.date ? new Date(payment.date) : undefined,
          submittedBy: payment.submittedBy.trim(),
          remark: payment.remark ? payment.remark.trim() : '',
        })),
        userId, // Assuming userId is part of the CustomerAccount schema
      });

      // Save the new customer account to the database
      const savedAccount = await newCustomerAccount.save();

      res.status(201).json(savedAccount);
    } catch (error) {
      console.error('Error creating customer account:', error);
      res.status(500).json({ message: 'Server Error' });
    }
  }
);

/**
 * @route   DELETE /api/accounts/:id/delete
 * @desc    Delete a customer account by ID
 * @access  Protected (Assuming authentication middleware is applied)
 */
customerRouter.delete('/:id/delete', async (req, res) => {
  try {
    const account = await CustomerAccount.findByIdAndDelete(req.params.id);
    if (!account) {
      return res.status(404).json({ message: 'Customer Account not found' });
    }
    res.json({ message: 'Customer Account deleted successfully' });
  } catch (error) {
    console.error('Error deleting customer account:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

/**
 * @route   GET /api/accounts/allaccounts
 * @desc    Get all customer accounts
 * @access  Protected (Assuming authentication middleware is applied)
 */
customerRouter.get('/allaccounts', async (req, res) => {
  try {
    // Optionally, implement pagination, filtering, or sorting based on query parameters
    const accounts = await CustomerAccount.find().sort({ createdAt: -1 });
    res.json(accounts);
  } catch (error) {
    console.error('Error fetching customer accounts:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

/**
 * @route   GET /api/accounts/get/:id
 * @desc    Get a specific customer account by ID
 * @access  Protected (Assuming authentication middleware is applied)
 */
customerRouter.get('/get/:id', async (req, res) => {
  try {
    const account = await CustomerAccount.findById(req.params.id);
    if (!account) {
      return res.status(404).json({ message: 'Customer Account not found' });
    }
    res.json(account);
  } catch (error) {
    console.error('Error fetching customer account:', error);
    res.status(500).json({ message: 'Server Error' });
  }
});

/**
 * @route   PUT /api/accounts/:id/update
 * @desc    Update a customer account by ID
 * @access  Protected (Assuming authentication middleware is applied)
 */
// PUT route to update a customer account

customerRouter.put(
  '/:id/update',
  [
    // Validation middlewares
    body('customerName')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Customer Name cannot be empty'),
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
    body('payments.*.amount')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Payment Amount must be a positive number'),
    body('payments.*.submittedBy')
      .optional()
      .trim()
      .notEmpty()
      .withMessage('Submitted By is required for each payment'),
    body('payments.*.date')
      .optional()
      .isISO8601()
      .toDate()
      .withMessage('Invalid Payment Date'),
    // Additional validations as needed
  ],
  async (req, res) => {
    // Start a session
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Handle validation errors
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        // Return the first validation error
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: errors.array()[0].msg });
      }

      const { customerName, bills, payments, userId } = req.body;

      // Find the customer account by ID
      const account = await CustomerAccount.findById(req.params.id).session(
        session
      );
      if (!account) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: 'Customer Account not found' });
      }

      // Update customer name if provided
      if (customerName !== undefined) {
        account.customerName = customerName.trim();
      }

      // === Handle Bills ===
      if (bills !== undefined) {
        // Check for duplicate invoice numbers within the bills
        const invoiceNos = bills.map((bill) => bill.invoiceNo.trim());
        const uniqueInvoiceNos = new Set(invoiceNos);
        if (invoiceNos.length !== uniqueInvoiceNos.size) {
          await session.abortTransaction();
          session.endSession();
          return res
            .status(400)
            .json({ message: 'Duplicate invoice numbers are not allowed.' });
        }

        // Map existing bills by their invoiceNo for easy lookup
        const existingBillsMap = new Map(
          account.bills.map((bill) => [bill.invoiceNo.trim(), bill])
        );

        // Bills to be updated in the account
        const updatedBills = [];

        for (const bill of bills) {
          const invoiceNo = bill.invoiceNo.trim();
          const existingBill = existingBillsMap.get(invoiceNo);

          if (existingBill) {
            // Existing bill, update it
            existingBill.billAmount = parseFloat(bill.billAmount);
            existingBill.invoiceDate = bill.invoiceDate
              ? new Date(bill.invoiceDate)
              : undefined;
            existingBill.deliveryStatus =
              bill.deliveryStatus || existingBill.deliveryStatus;
            updatedBills.push(existingBill);
            existingBillsMap.delete(invoiceNo);

            // Update the Billing model if bill exists there
            const existingBilling = await Billing.findOne({ invoiceNo })
              .session(session)
              .exec();
            if (existingBilling) {
              existingBilling.grandTotal = parseFloat(bill.billAmount);
              existingBilling.invoiceDate = bill.invoiceDate
                ? new Date(bill.invoiceDate)
                : existingBilling.invoiceDate;
              existingBilling.deliveryStatus =
                bill.deliveryStatus || existingBilling.deliveryStatus;
              await existingBilling.save({ session });
            }
          } else {
            // New bill, add it to the account
            const newBill = {
              invoiceNo,
              billAmount: parseFloat(bill.billAmount),
              invoiceDate: bill.invoiceDate
                ? new Date(bill.invoiceDate)
                : new Date(),
              deliveryStatus: bill.deliveryStatus || 'Pending',
            };
            updatedBills.push(newBill);

            // Optionally update the Billing model if the bill exists there
            const existingBilling = await Billing.findOne({ invoiceNo })
              .session(session)
              .exec();
            if (existingBilling) {
              existingBilling.grandTotal = parseFloat(bill.billAmount);
              existingBilling.invoiceDate = bill.invoiceDate
                ? new Date(bill.invoiceDate)
                : existingBilling.invoiceDate;
              existingBilling.deliveryStatus =
                bill.deliveryStatus || existingBilling.deliveryStatus;
              await existingBilling.save({ session });
            }
          }
        }

        // Remove any bills that are no longer in the updated list
        for (const [invoiceNo, billToDelete] of existingBillsMap) {
          // Remove the bill from Billing model if it exists
          const existingBilling = await Billing.findOne({ invoiceNo }).session(
            session
          );
          if (existingBilling) {
            await existingBilling.remove({ session });
          }
          // The bill will be removed from account.bills when we reassign updatedBills
        }

        // Update the account's bills
        account.bills = updatedBills;
      }

      // === Handle Payments ===
      if (payments !== undefined) {
        // Generate a unique referenceId for new payments
        const generateReferenceId = () => 'PAY' + Date.now().toString();

        // Map existing payments by their referenceId for easy lookup
        const existingPaymentsMap = new Map(
          account.payments.map((payment) => [payment.referenceId, payment])
        );

        // Payments to be updated in the account
        const updatedPayments = [];

        for (const payment of payments) {
          const referenceId =
            payment.referenceId || generateReferenceId() + Math.random();

          if (existingPaymentsMap.has(referenceId)) {
            // Existing payment, update it
            const existingPayment = existingPaymentsMap.get(referenceId);
            existingPayment.amount = parseFloat(payment.amount);
            existingPayment.date = payment.date
              ? new Date(payment.date)
              : undefined;
            existingPayment.submittedBy = payment.submittedBy.trim();
            existingPayment.remark = payment.remark
              ? payment.remark.trim()
              : '';
            existingPayment.method = payment.method
              ? payment.method.trim()
              : existingPayment.method;
            existingPayment.invoiceNo = payment.invoiceNo
              ? payment.invoiceNo.trim()
              : existingPayment.invoiceNo;
            updatedPayments.push(existingPayment);
            existingPaymentsMap.delete(referenceId);

            // Update payment in PaymentsAccount
            await PaymentsAccount.updateOne(
              { 'paymentsIn.referenceId': referenceId },
              {
                $set: {
                  'paymentsIn.$.amount': parseFloat(payment.amount),
                  'paymentsIn.$.date': payment.date
                    ? new Date(payment.date)
                    : undefined,
                  'paymentsIn.$.submittedBy': payment.submittedBy.trim(),
                  'paymentsIn.$.remark': payment.remark
                    ? payment.remark.trim()
                    : '',
                  'paymentsIn.$.method': payment.method
                    ? payment.method.trim()
                    : 'Cash',
                },
              },
              { session }
            );

            // Update payment in Billing model if associated
            if (payment.invoiceNo) {
              const invoiceNo = payment.invoiceNo.trim();
              const existingBilling = await Billing.findOne({ invoiceNo })
                .session(session)
                .exec();
              if (existingBilling) {
                const billingPaymentIndex = existingBilling.payments.findIndex(
                  (p) => p.referenceId === referenceId
                );
                if (billingPaymentIndex !== -1) {
                  existingBilling.payments[billingPaymentIndex].amount =
                    parseFloat(payment.amount);
                  existingBilling.payments[billingPaymentIndex].date = payment.date
                    ? new Date(payment.date)
                    : undefined;
                  existingBilling.payments[
                    billingPaymentIndex
                  ].submittedBy = payment.submittedBy.trim();
                  existingBilling.payments[billingPaymentIndex].remark =
                    payment.remark ? payment.remark.trim() : '';
                  existingBilling.payments[billingPaymentIndex].method = payment.method
                    ? payment.method.trim()
                    : 'Cash';
                  existingBilling.markModified('payments');

                  // Recalculate billingAmountReceived and paymentStatus
                  existingBilling.billingAmountReceived =
                    existingBilling.payments.reduce(
                      (total, payment) => total + (payment.amount || 0),
                      0
                    );
                  const netAmount = existingBilling.grandTotal || 0;
                  if (
                    existingBilling.billingAmountReceived >= netAmount
                  ) {
                    existingBilling.paymentStatus = 'Paid';
                  } else if (existingBilling.billingAmountReceived > 0) {
                    existingBilling.paymentStatus = 'Partial';
                  } else {
                    existingBilling.paymentStatus = 'Unpaid';
                  }

                  await existingBilling.save({ session });
                }
              }
            }
          } else {
            // New payment, add it
            const newPayment = {
              amount: parseFloat(payment.amount),
              date: payment.date ? new Date(payment.date) : new Date(),
              submittedBy: payment.submittedBy.trim(),
              remark: payment.remark ? payment.remark.trim() : '',
              referenceId,
              method: payment.method ? payment.method.trim() : 'Cash',
              invoiceNo: payment.invoiceNo ? payment.invoiceNo.trim() : undefined,
            };
            updatedPayments.push(newPayment);

            // Add payment to PaymentsAccount
            const paymentMethod = payment.method
              ? payment.method.trim()
              : 'Cash';
            let paymentAccount = await PaymentsAccount.findOne({
              accountId: paymentMethod,
            }).session(session);
            if (!paymentAccount) {
              paymentAccount = new PaymentsAccount({
                accountId: paymentMethod,
                accountName: paymentMethod,
                paymentsIn: [],
                paymentsOut: [],
              });
            }
            paymentAccount.paymentsIn.push({
              amount: parseFloat(payment.amount),
              method: paymentMethod,
              submittedBy: payment.submittedBy.trim(),
              remark: payment.remark ? payment.remark.trim() : '',
              date: payment.date ? new Date(payment.date) : new Date(),
              referenceId,
            });
            await paymentAccount.save({ session });

            // Associate payment with Billing if invoiceNo is provided and exists
            if (payment.invoiceNo) {
              const invoiceNo = payment.invoiceNo.trim();
              const existingBilling = await Billing.findOne({ invoiceNo })
                .session(session)
                .exec();
              if (existingBilling) {
                existingBilling.payments.push({
                  amount: parseFloat(payment.amount),
                  method: paymentMethod,
                  date: payment.date ? new Date(payment.date) : new Date(),
                  referenceId,
                  remark: payment.remark ? payment.remark.trim() : '',
                  invoiceNo,
                });

                // Recalculate billingAmountReceived and paymentStatus
                existingBilling.billingAmountReceived =
                  existingBilling.payments.reduce(
                    (total, payment) => total + (payment.amount || 0),
                    0
                  );
                const netAmount = existingBilling.grandTotal || 0;
                if (existingBilling.billingAmountReceived >= netAmount) {
                  existingBilling.paymentStatus = 'Paid';
                } else if (existingBilling.billingAmountReceived > 0) {
                  existingBilling.paymentStatus = 'Partial';
                } else {
                  existingBilling.paymentStatus = 'Unpaid';
                }

                await existingBilling.save({ session });
              }
            }
          }
        }

        // Remove any payments that are no longer in the updated list
        for (const [referenceId, paymentToDelete] of existingPaymentsMap) {
          // Remove payment from PaymentsAccount
          await PaymentsAccount.updateOne(
            { 'paymentsIn.referenceId': referenceId },
            { $pull: { paymentsIn: { referenceId } } },
            { session }
          );

          // Remove payment from Billing model
          await Billing.updateMany(
            { 'payments.referenceId': referenceId },
            { $pull: { payments: { referenceId } } },
            { session }
          );
        }

        // Update the account's payments
        account.payments = updatedPayments;
      }

      // Optionally update userId if necessary
      if (userId !== undefined) {
        account.userId = userId;
      }

      // Recalculate totalBillAmount, paidAmount, pendingAmount
      account.totalBillAmount = account.bills.reduce(
        (acc, bill) => acc + (bill.billAmount || 0),
        0
      );
      account.paidAmount = account.payments.reduce(
        (acc, payment) => acc + (payment.amount || 0),
        0
      );
      account.pendingAmount = account.totalBillAmount - account.paidAmount;

      if (account.pendingAmount < 0) {
        await session.abortTransaction();
        session.endSession();
        return res
          .status(400)
          .json({ message: 'Paid amount exceeds total bill amount' });
      }

      // Save the updated account
      await account.save({ session });

      // Commit the transaction
      await session.commitTransaction();
      session.endSession();

      res.status(200).json({ message: 'Customer account updated successfully.' });
    } catch (error) {
      console.error('Error updating customer account:', error);

      // Abort the transaction on error
      if (session.inTransaction()) {
        await session.abortTransaction();
      }
      session.endSession();

      res.status(500).json({ message: 'Server Error', error: error.message });
    }
  }
);

export default customerRouter;
