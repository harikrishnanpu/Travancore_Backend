// routes/customerAccountcustomerRouter.js
import express from 'express';
import { body, validationResult } from 'express-validator';
import CustomerAccount from '../models/customerModal.js';

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
customerRouter.put(
  '/:id/update',
  [
    // Similar validation as the create route
    body('customerName').optional().trim().notEmpty().withMessage('Customer Name cannot be empty'),
    body('bills').optional().isArray().withMessage('Bills must be an array'),
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
    body('payments').optional().isArray().withMessage('Payments must be an array'),
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
      const { customerName, bills, payments, userId } = req.body;

      // Find the customer account by ID
      const account = await CustomerAccount.findById(req.params.id);
      if (!account) {
        return res.status(404).json({ message: 'Customer Account not found' });
      }

      // Update fields if they are provided
      if (customerName !== undefined) {
        account.customerName = customerName.trim();
      }

      if (bills !== undefined) {
        // Check for duplicate invoice numbers
        const invoiceNos = bills.map((bill) => bill.invoiceNo.trim());
        const uniqueInvoiceNos = new Set(invoiceNos);
        if (invoiceNos.length !== uniqueInvoiceNos.size) {
          return res.status(400).json({ message: 'Duplicate invoice numbers are not allowed.' });
        }

        // Update bills
        account.bills = bills.map((bill) => ({
          invoiceNo: bill.invoiceNo.trim(),
          billAmount: parseFloat(bill.billAmount),
          invoiceDate: bill.invoiceDate ? new Date(bill.invoiceDate) : undefined,
        }));
      }

      if (payments !== undefined) {
        // Update payments
        account.payments = payments.map((payment) => ({
          amount: parseFloat(payment.amount),
          date: payment.date ? new Date(payment.date) : undefined,
          submittedBy: payment.submittedBy.trim(),
          remark: payment.remark ? payment.remark.trim() : '',
        }));
      }

      // Optionally update userId if necessary
      if (userId !== undefined) {
        account.userId = userId;
      }

      // Save the updated account (balanceAmount, paidAmount, pendingAmount will be auto-calculated)
      const updatedAccount = await account.save();

      res.json(updatedAccount);
    } catch (error) {
      console.error('Error updating customer account:', error);
      res.status(500).json({ message: 'Server Error' });
    }
  }
);

export default customerRouter;
