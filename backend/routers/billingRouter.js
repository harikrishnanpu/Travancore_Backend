import express from 'express';
import Billing from '../models/billingModal.js';
import Product from '../models/productModel.js';
import Log from '../models/Logmodal.js';
import mongoose from 'mongoose';
import Purchase from '../models/purchasemodals.js';
import User from '../models/userModel.js';
import PaymentsAccount from '../models/paymentsAccountModal.js';
import CustomerAccount from '../models/customerModal.js';
import SupplierAccount from '../models/supplierAccountModal.js';

const billingRouter = express.Router();


// =========================
// Route: Create Billing Entry
// =========================
billingRouter.post('/create', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const {
      invoiceNo,
      invoiceDate,
      salesmanName,
      expectedDeliveryDate,
      deliveryStatus = 'Pending',
      grandTotal,
      billingAmount,
      discount = 0,
      customerId,
      customerName,
      customerAddress,
      customerContactNumber,
      marketedBy,
      paymentAmount,
      paymentMethod,
      paymentReceivedDate,
      salesmanPhoneNumber,
      unloading = 0,
      transportation = 0,
      handlingcharge = 0,
      remark,
      userId,
      products, // Expected to be an array of objects with item_id and quantity
    } = req.body;

    const referenceId = 'BILL' + Date.now().toString();

    // -----------------------
    // 1. Validate Required Fields
    // -----------------------
    if (
      !invoiceNo ||
      !invoiceDate ||
      !salesmanName ||
      !customerName ||
      !customerAddress ||
      !customerId ||
      !products ||
      !salesmanPhoneNumber ||
      !Array.isArray(products) ||
      products.length === 0
    ) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Missing required fields' });
    }

    // -----------------------
    // 2. Check for Existing Invoice
    // -----------------------
    const existingBill = await Billing.findOne({ invoiceNo }).session(session);
    if (existingBill) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ message: `Invoice number ${invoiceNo} already exists` });
    }

    // -----------------------
    // 3. Calculate Total Amount After Discount
    // -----------------------
    const parsedBillingAmount = parseFloat(billingAmount);
    const parsedDiscount = parseFloat(discount);

    if (isNaN(parsedBillingAmount) || parsedBillingAmount <= 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Invalid billing amount' });
    }

    if (isNaN(parsedDiscount) || parsedDiscount < 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ message: 'Invalid discount amount' });
    }

    const totalAmount = parsedBillingAmount - parsedDiscount;
    if (totalAmount < 0) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ message: 'Discount cannot exceed billing amount' });
    }

    // -----------------------
    // 4. Fetch and Validate User
    // -----------------------
    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'User not found' });
    }

    const isAdmin = user.isAdmin;

    // -----------------------
    // 5. Find or Create Customer Account
    // -----------------------
    let customerAccount = await CustomerAccount.findOne({
      customerId: customerId.trim(),
    }).session(session);

    if (!customerAccount) {
      // Create new customer account
      customerAccount = new CustomerAccount({
        customerId: customerId.trim(),
        customerName: customerName.trim(),
        customerAddress: customerAddress.trim(),
        customerContactNumber: customerContactNumber.trim(),
        bills: [], // Initialize bills array
        payments: [], // Initialize payments array
      });
    }

    // Check if the bill with the same invoiceNo already exists in customer's bills array
    const existingBillInCustomer = customerAccount.bills.find(
      (bill) => bill.invoiceNo === invoiceNo.trim()
    );
    if (existingBillInCustomer) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message: `Invoice number ${invoiceNo} already exists for this customer`,
      });
    }

    // -----------------------
    // 6. Initialize Billing Data
    // -----------------------
    const billingData = new Billing({
      invoiceNo: invoiceNo.trim(),
      invoiceDate: new Date(invoiceDate),
      salesmanName: salesmanName.trim(),
      expectedDeliveryDate: new Date(expectedDeliveryDate),
      deliveryStatus,
      grandTotal: parseFloat(grandTotal),
      billingAmount: parsedBillingAmount,
      discount: parsedDiscount,
      customerId: customerId.trim(),
      customerName: customerName.trim(),
      customerAddress: customerAddress.trim(),
      customerContactNumber: customerContactNumber.trim(),
      marketedBy: marketedBy ? marketedBy.trim() : '',
      submittedBy: userId,
      handlingCharge: parseFloat(handlingcharge),
      remark: remark ? remark.trim() : '',
      products,
      unloading: parseFloat(unloading),
      transportation: parseFloat(transportation),
      payments: [], // Initialize payments as an empty array
      isApproved: isAdmin, // Automatically approve if user is admin
      salesmanPhoneNumber: salesmanPhoneNumber.trim(),
    });

    // -----------------------
    // 7. Associate Bill with Customer Account
    // -----------------------
    customerAccount.bills.push({
      invoiceNo: invoiceNo.trim(),
      billAmount: parseFloat(grandTotal),
      invoiceDate: new Date(invoiceDate),
      deliveryStatus,
    });

    // -----------------------
    // 8. Add Initial Payment if Provided
    // -----------------------
    if (paymentAmount && paymentMethod) {
      const parsedPaymentAmount = parseFloat(paymentAmount);

      // Validate payment amount
      if (isNaN(parsedPaymentAmount) || parsedPaymentAmount <= 0) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: 'Invalid payment amount' });
      }

      // Ensure paymentAmount does not exceed totalAmount
      if (parsedPaymentAmount > totalAmount) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          message:
            'Payment amount cannot exceed total amount after discount',
        });
      }

      const currentDate = new Date(paymentReceivedDate || Date.now());

      const paymentReferenceId = 'PAY' + Date.now().toString();

      const paymentEntry = {
        amount: parsedPaymentAmount,
        method: paymentMethod.trim(),
        date: currentDate,
        referenceId: paymentReferenceId,
        method: paymentMethod.trim(),
        invoiceNo: invoiceNo.trim(), // Link payment to billing
      };

      const accountPaymentEntry = {
        amount: parsedPaymentAmount,
        method: paymentMethod.trim(),
        remark: `Bill ${invoiceNo.trim()}`,
        submittedBy: userId,
        date: currentDate,
        referenceId: paymentReferenceId,
      };

      const account = await PaymentsAccount.findOne({
        accountId: paymentMethod.trim(),
      }).session(session);

      if (!account) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: 'Payment account not found' });
      }

      account.paymentsIn.push(accountPaymentEntry);
      await account.save({ session });

      // Add payment to CustomerAccount's payments array with invoiceNo
      customerAccount.payments.push({
        amount: parsedPaymentAmount,
        method: paymentMethod.trim(),
        remark: `Bill ${invoiceNo.trim()}`,
        submittedBy: userId,
        date: currentDate,
        referenceId: paymentReferenceId,
        invoiceNo: invoiceNo.trim(),
      });

      // Add the payment to the billing payments array with invoiceNo
      billingData.payments.push(paymentEntry);
    }

    // -----------------------
    // 9. Update Salesman Phone Number
    // -----------------------
    const salesmanUser = await User.findOne({
      name: salesmanName.trim(),
    }).session(session);
    if (salesmanUser) {
      salesmanUser.contactNumber = salesmanPhoneNumber.trim();
      await salesmanUser.save({ session });
    } else {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Salesman user not found' });
    }

    // -----------------------
    // 10. Conditionally Update Stock
    // -----------------------
    let productUpdatePromises = [];
    if (isAdmin) {
      // Only update stock if the user is admin during creation
      for (const item of products) {
        const { item_id, quantity } = item;

        // Validate individual product details
        if (!item_id || isNaN(quantity) || quantity <= 0) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({ message: 'Invalid product details' });
        }

        // Fetch product using item_id
        const product = await Product.findOne({
          item_id: item_id.trim(),
        }).session(session);
        if (!product) {
          await session.abortTransaction();
          session.endSession();
          return res
            .status(404)
            .json({ message: `Product with ID ${item_id} not found` });
        }

        // Check if there is enough stock
        if (product.countInStock < quantity) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            message: `Insufficient stock for product ID ${item_id}`,
          });
        }

        // Deduct the stock
        product.countInStock -= parseFloat(quantity);
        productUpdatePromises.push(product.save({ session }));
      }
    }

    // -----------------------
    // 11. Save Billing Data and Update Products
    // -----------------------
    await customerAccount.save({ session });
    await billingData.save({ session });

    if (isAdmin) {
      await Promise.all(productUpdatePromises);
    }

    // -----------------------
    // 12. Commit the Transaction
    // -----------------------
    await session.commitTransaction();
    session.endSession();

    // -----------------------
    // 13. Respond to Client
    res.status(201).json({
      message: 'Billing data saved successfully',
      billingData,
    });
  } catch (error) {
    console.log('Error saving billing data:', error);
    // Attempt to abort the transaction if it's still active
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    res.status(500).json({
      message: 'Error saving billing data',
      error: error.message,
    });
  }
});



// =========================
// Route: Edit Billing Entry
// =========================
billingRouter.post('/edit/:id', async (req, res) => {
  const billingId = req.params.id;

  // Start a MongoDB session for transaction
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Destructure required fields from request body
    const {
      invoiceNo,
      invoiceDate,
      salesmanName,
      expectedDeliveryDate,
      billingAmount,
      grandTotal,
      customerName,
      customerAddress,
      products,
      discount = 0,
      unloading = 0,
      transportation = 0,
      handlingcharge = 0,
      remark,
      customerId,
      paymentStatus,
      deliveryStatus,
      customerContactNumber,
      paymentAmount,
      paymentMethod,
      paymentReceivedDate,
      marketedBy,
      userId,
      salesmanPhoneNumber,
    } = req.body;

    // === 1. Basic Validation ===

    // Check for required fields
    if (
      !invoiceNo ||
      !invoiceDate ||
      !salesmanName ||
      !expectedDeliveryDate ||
      !billingAmount ||
      !customerName ||
      !customerAddress ||
      !customerContactNumber ||
      !customerId ||
      !products ||
      !Array.isArray(products) ||
      products.length === 0
    ) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({
        message:
          'Missing required fields. Ensure all mandatory fields are provided.',
      });
    }

    // Fetch the existing billing record
    const existingBilling = await Billing.findById(billingId).session(session);
    if (!existingBilling) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Billing record not found.' });
    }

    // Fetch the user performing the operation
    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'User not found.' });
    }

    const isAdmin = user.isAdmin;
    const isBillApproved = existingBilling.isApproved;

    // === 2. Prepare Product Data ===

    // Extract all product IDs from the updated products list
    const updatedProductIds = products.map((item) => item.item_id.trim());

    // Fetch all products involved in the update in a single query
    const fetchedProducts = await Product.find({
      item_id: { $in: updatedProductIds },
    }).session(session);

    // Create a map for quick access to products by item_id
    const productMap = {};
    fetchedProducts.forEach((product) => {
      productMap[product.item_id] = product;
    });

    // === 3. Handle Product Updates ===

    // Track products to be removed (present in existingBilling but not in updated list)
    const existingProductIds = existingBilling.products.map((p) => p.item_id);
    const productsToRemove = existingBilling.products.filter(
      (p) => !updatedProductIds.includes(p.item_id)
    );

    // === 3.1. Remove Products Not Present in Updated List ===
    for (const product of productsToRemove) {
      const productInDB = await Product.findOne({
        item_id: product.item_id,
      }).session(session);
      if (productInDB) {
        // Add back the quantity to stock only if stock was already deducted
        if (isBillApproved || isAdmin) {
          productInDB.countInStock += parseFloat(product.quantity);
          await productInDB.save({ session });
        }
      }
      // Remove the product from billing
      existingBilling.products.pull(product._id);
    }

    // === 3.2. Update Existing Products and Add New Products ===
    const productUpdatePromises = [];

    for (const updatedProduct of products) {
      const {
        item_id,
        name,
        category,
        brand,
        quantity,
        sellingPrice,
        enteredQty,
        sellingPriceinQty,
        unit,
        length,
        breadth,
        psRatio,
        size,
      } = updatedProduct;

      const trimmedItemId = item_id.trim();
      const newQuantity = parseFloat(quantity);

      // Validate product exists in the database
      const productInDB = productMap[trimmedItemId];
      if (!productInDB) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({
          message: `Product with ID ${trimmedItemId} not found.`,
        });
      }

      // Find the product in the existing billing
      const existingProductInBilling = existingBilling.products.find(
        (p) => p.item_id === trimmedItemId
      );

      if (existingProductInBilling) {
        // Calculate quantity difference
        const previousQuantity = parseFloat(
          existingProductInBilling.quantity
        );
        const quantityDifference = newQuantity - previousQuantity;

        if (isBillApproved || isAdmin) {
          // Calculate new stock count
          const newStockCount =
            productInDB.countInStock - quantityDifference;

          if (newStockCount < 0) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
              message: `Insufficient stock for product ID ${trimmedItemId}. Only ${
                productInDB.countInStock + previousQuantity
              } available.`,
            });
          }

          // Update stock count
          productInDB.countInStock = newStockCount;
          productUpdatePromises.push(productInDB.save({ session }));
        }

        // Update product details in billing
        existingProductInBilling.set({
          quantity: newQuantity,
          sellingPrice: parseFloat(sellingPrice) || 0,
          enteredQty: parseFloat(enteredQty) || 0,
          sellingPriceinQty: parseFloat(sellingPriceinQty) || 0,
          unit: unit || existingProductInBilling.unit,
          length: parseFloat(length) || 0,
          breadth: parseFloat(breadth) || 0,
          psRatio: parseFloat(psRatio) || 0,
          size: size || productInDB.size,
        });
      } else {
        // New product to be added to billing
        if (isBillApproved || isAdmin) {
          // Ensure sufficient stock
          if (productInDB.countInStock < newQuantity) {
            await session.abortTransaction();
            session.endSession();
            return res.status(400).json({
              message: `Insufficient stock for product ID ${trimmedItemId}. Only ${productInDB.countInStock} available.`,
            });
          }

          // Deduct stock
          productInDB.countInStock -= newQuantity;
          productUpdatePromises.push(productInDB.save({ session }));
        }

        // Add new product to billing
        existingBilling.products.push({
          item_id: trimmedItemId,
          name: name || productInDB.name,
          sellingPrice: parseFloat(sellingPrice) || 0,
          quantity: newQuantity,
          category: category || productInDB.category,
          brand: brand || productInDB.brand,
          unit: unit || productInDB.unit,
          sellingPriceinQty: parseFloat(sellingPriceinQty) || 0,
          enteredQty: parseFloat(enteredQty) || 0,
          length: parseFloat(length) || 0,
          breadth: parseFloat(breadth) || 0,
          psRatio: parseFloat(psRatio) || 0,
          size: productInDB.size || size,
        });
      }
    }

    // Mark products array as modified
    existingBilling.markModified('products');

    // === 4. Find or Create Customer Account Based on Updated Customer Information ===

    let customerAccount;

    // Store the old customerId before updating
    const oldCustomerId = existingBilling.customerId;

    // Check if customer details have changed
    const isCustomerChanged =
      existingBilling.customerId !== customerId.trim();

    // Update customer details in existingBilling regardless
    existingBilling.set({
      customerId: customerId.trim(),
      customerName: customerName.trim(),
      customerAddress: customerAddress.trim(),
      customerContactNumber: customerContactNumber.trim(),
    });

    // Find or create the new customer account
    customerAccount = await CustomerAccount.findOne({
      customerId: customerId.trim(),
    }).session(session);

    if (!customerAccount) {
      // If no existing account, create a new CustomerAccount
      customerAccount = new CustomerAccount({
        customerId: customerId.trim(),
        customerName: customerName.trim(),
        customerAddress: customerAddress.trim(),
        customerContactNumber: customerContactNumber.trim(),
        bills: [],
        payments: [],
      });
    } else {
      // Update the customer details
      customerAccount.set({
        customerName: customerName.trim(),
        customerAddress: customerAddress.trim(),
        customerContactNumber: customerContactNumber.trim(),
      });
    }

    // Check if the bill with the same invoiceNo already exists in new customer's bills array
    const existingBillInNewCustomer = customerAccount.bills.find(
      (bill) => bill.invoiceNo === invoiceNo.trim()
    );

    if (!existingBillInNewCustomer) {
      // Add the bill to the new CustomerAccount's bills array
      customerAccount.bills.push({
        invoiceNo: invoiceNo.trim(),
        billAmount: parseFloat(grandTotal),
        invoiceDate: new Date(invoiceDate),
        deliveryStatus,
      });
    } else {
      // Update existing bill details
      existingBillInNewCustomer.set({
        billAmount: parseFloat(grandTotal),
        invoiceDate: new Date(invoiceDate),
        deliveryStatus,
      });
    }

    // Mark bills array as modified
    customerAccount.markModified('bills');

    if (isCustomerChanged) {
      // **Transfer Payments from Old Customer to New Customer**
      const oldCustomerAccount = await CustomerAccount.findOne({
        customerId: oldCustomerId,
      }).session(session);
      if (oldCustomerAccount) {
        // Move payments
        const paymentsToTransfer = oldCustomerAccount.payments.filter(
          (payment) => payment.invoiceNo === invoiceNo.trim()
        );

        // Remove payments from old customer account
        oldCustomerAccount.payments = oldCustomerAccount.payments.filter(
          (payment) => payment.invoiceNo !== invoiceNo.trim()
        );

        // Remove the bill from the old CustomerAccount's bills array
        oldCustomerAccount.bills = oldCustomerAccount.bills.filter(
          (bill) => bill.invoiceNo !== invoiceNo.trim()
        );

        // Mark arrays as modified
        oldCustomerAccount.markModified('payments');
        oldCustomerAccount.markModified('bills');

        // Save the old customer account
        await oldCustomerAccount.save({ session });

        // Add payments to new customer account
        customerAccount.payments.push(...paymentsToTransfer);
        customerAccount.markModified('payments');
      }
    }

    // === 5. Handle Payments ===

    if (paymentAmount && paymentMethod) {
      const paymentReferenceId = 'PAY' + Date.now().toString();
      const parsedPaymentAmount = parseFloat(paymentAmount);

      // Validate payment amount
      if (isNaN(parsedPaymentAmount) || parsedPaymentAmount <= 0) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: 'Invalid payment amount.' });
      }

      // Ensure paymentAmount does not exceed totalAmount after discount
      const totalAmount =
        parseFloat(billingAmount) - parseFloat(discount || 0);
      if (parsedPaymentAmount > totalAmount) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({
          message:
            'Payment amount cannot exceed total amount after discount.',
        });
      }

      const currentDate = new Date(paymentReceivedDate || Date.now());

      const paymentEntry = {
        amount: parsedPaymentAmount,
        method: paymentMethod.trim(),
        date: currentDate,
        referenceId: paymentReferenceId,
        invoiceNo: invoiceNo.trim(), // **Link payment to billing**
      };

      // Add the payment to the billing payments array
      existingBilling.payments.push(paymentEntry);

      // Also add payment to CustomerAccount's payments array with invoiceNo
      customerAccount.payments.push({
        amount: parsedPaymentAmount,
        method: paymentMethod.trim(),
        remark: `Bill ${invoiceNo.trim()}`,
        submittedBy: userId,
        date: currentDate,
        referenceId: paymentReferenceId,
        invoiceNo: invoiceNo.trim(), // **Link payment to billing**
      });

      // Handle PaymentsAccount
      const account = await PaymentsAccount.findOne({
        accountId: paymentMethod.trim(),
      }).session(session);
      if (!account) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: 'Payment account not found.' });
      }

      const accountPaymentEntry = {
        amount: parsedPaymentAmount,
        method: paymentMethod.trim(),
        remark: `Bill ${invoiceNo.trim()}`,
        submittedBy: userId,
        date: currentDate,
        referenceId: paymentReferenceId, // This field is being set here
      };

      account.paymentsIn.push(accountPaymentEntry);
      account.markModified('paymentsIn');
      await account.save({ session });
    }

    // === 6. Update Billing Details ===

    existingBilling.set({
      invoiceNo: invoiceNo.trim(),
      invoiceDate: new Date(invoiceDate),
      salesmanName: salesmanName.trim(),
      expectedDeliveryDate: new Date(expectedDeliveryDate),
      billingAmount: parseFloat(billingAmount) || 0,
      grandTotal: parseFloat(grandTotal) || 0,
      discount: parseFloat(discount) || 0,
      unloading: parseFloat(unloading) || 0,
      transportation: parseFloat(transportation) || 0,
      handlingCharge: parseFloat(handlingcharge) || 0,
      remark: remark ? remark.trim() : existingBilling.remark,
      marketedBy: marketedBy ? marketedBy.trim() : existingBilling.marketedBy,
      paymentStatus: paymentStatus || existingBilling.paymentStatus,
      deliveryStatus: deliveryStatus || existingBilling.deliveryStatus,
      salesmanPhoneNumber: salesmanPhoneNumber.trim(),
    });

    // === 7. Update Salesman Phone Number ===
    const salesmanUser = await User.findOne({
      name: salesmanName.trim(),
    }).session(session);
    if (salesmanUser) {
      salesmanUser.contactNumber = salesmanPhoneNumber.trim();
      await salesmanUser.save({ session });
    } else {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Salesman user not found' });
    }

    // === 8. Update Stock if User is Admin or Bill is Approved ===
    if (isAdmin || isBillApproved) {
      await Promise.all(productUpdatePromises);
    }

    // === 9. Save Billing and CustomerAccount ===
    await existingBilling.save({ session });
    await customerAccount.save({ session });

    // === 10. Commit Transaction ===
    await session.commitTransaction();
    session.endSession();

    // === 11. Send Success Response ===
    res.status(200).json({ message: 'Billing data updated successfully.' });
  } catch (error) {
    // Abort transaction on error
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();

    console.error('Error updating billing data:', error);

    // Send error response
    res.status(500).json({
      message: 'Error updating billing data.',
      error: error.message,
    });
  }
});






// =========================
// Route: Delete Billing Entry
// =========================
billingRouter.delete('/billings/delete/:id', async (req, res) => {
  // Start a MongoDB session for transaction
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const billingId = req.params.id;

    // === 1. Authenticate and Authorize User ===
    const { userId } = req.query;

    // Ensure userId is sent in the request body
    if (!userId) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(400)
        .json({ message: 'User ID is required for authorization.' });
    }

    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'User not found.' });
    }

    const isAdmin = user.isAdmin;
    if (!isAdmin) {
      await session.abortTransaction();
      session.endSession();
      return res
        .status(403)
        .json({ message: 'Unauthorized. Admin privileges required.' });
    }

    // === 2. Fetch the Billing Record ===
    const billing = await Billing.findById(billingId).session(session);
    if (!billing) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Billing record not found.' });
    }

    const {
      customerId,
      invoiceNo,
      payments, // Array of payment objects
      products, // Array of product objects
      isApproved,
    } = billing;

    // === 3. Fetch the Customer Account ===
    const customerAccount = await CustomerAccount.findOne({
      customerId: customerId.trim(),
    }).session(session);
    if (!customerAccount) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Customer account not found.' });
    }

    // === 4. Remove the Billing from Customer's Bills ===
    const billIndex = customerAccount.bills.findIndex(
      (bill) => bill.invoiceNo === invoiceNo.trim()
    );
    if (billIndex !== -1) {
      customerAccount.bills.splice(billIndex, 1);
    }

    // === 5. Handle Associated Payments ===
    if (payments && payments.length > 0) {
      for (const payment of payments) {
        const { amount, method, date, submittedBy, referenceId } = payment;

        // a. Remove Payment from PaymentsAccount
        const paymentsAccount = await PaymentsAccount.findOne({
          accountId: method.trim(),
        }).session(session);
        if (paymentsAccount) {
          const paymentIndex = paymentsAccount.paymentsIn.findIndex(
            (p) =>
              p.referenceId === referenceId &&
              p.amount === amount &&
              p.submittedBy === submittedBy &&
              new Date(p.date).getTime() === new Date(date).getTime()
          );

          if (paymentIndex !== -1) {
            paymentsAccount.paymentsIn.splice(paymentIndex, 1);
            await paymentsAccount.save({ session });
          }
        }

        // b. Remove Payment from CustomerAccount's Payments
        const customerPaymentIndex = customerAccount.payments.findIndex(
          (p) => p.referenceId === referenceId
        );

        if (customerPaymentIndex !== -1) {
          customerAccount.payments.splice(customerPaymentIndex, 1);
        }
      }
    }

    // === 6. Restore Product Stock ===
    if (products && products.length > 0) {
      for (const item of products) {
        const { item_id, quantity } = item;

        // Validate product details
        if (!item_id || isNaN(quantity) || quantity <= 0) {
          await session.abortTransaction();
          session.endSession();
          return res.status(400).json({
            message: 'Invalid product details in billing.',
          });
        }

        // Fetch the product
        const product = await Product.findOne({
          item_id: item_id.trim(),
        }).session(session);
        if (product) {
          // Restore the stock only if the billing was approved or the user is admin
          if (isApproved || isAdmin) {
            product.countInStock += parseFloat(quantity);
            await product.save({ session });
          }
        } else {
          await session.abortTransaction();
          session.endSession();
          return res.status(404).json({
            message: `Product with ID ${item_id.trim()} not found.`,
          });
        }
      }
    }

    // === 7. Remove the Billing Entry ===
    await Billing.findByIdAndRemove(billingId).session(session);

    // === 8. Save the Updated Customer Account ===
    await customerAccount.save({ session });

    // === 9. Commit the Transaction ===
    await session.commitTransaction();
    session.endSession();

    // === 10. Respond to the Client ===
    res.status(200).json({ message: 'Billing record deleted successfully.' });
  } catch (error) {
    console.log('Error deleting billing record:', error);

    // Attempt to abort the transaction if it's still active
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    res.status(500).json({
      message: 'Error deleting billing record.',
      error: error.message,
    });
  }
});





// =========================
// Route: Approve Billing Entry
// =========================
billingRouter.put('/bill/approve/:billId', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { billId } = req.params;
    const { userId } = req.body; // Assuming the approving userId is sent in the body

    // Fetch the user performing the approval
    const approvingUser = await User.findById(userId).session(session);
    if (!approvingUser) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: 'Approving user not found' });
    }

    if (!approvingUser.isAdmin) {
      await session.abortTransaction();
      session.endSession();
      return res.status(403).json({ error: 'Only admins can approve bills' });
    }

    // Find the existing bill
    const existingBill = await Billing.findById(billId).session(session);
    if (!existingBill) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: 'Bill not found' });
    }

    // Check if the bill is already approved
    if (existingBill.isApproved) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: 'Bill is already approved' });
    }

    // Update bill status to 'approved'
    existingBill.isApproved = true;
    existingBill.approvedBy = userId;

    // -----------------------
    // 1. Update Stock During Approval
    // -----------------------
    const productUpdatePromises = [];
    for (const item of existingBill.products) {
      const { item_id, quantity } = item;

      // Fetch product using item_id
      const product = await Product.findOne({ item_id }).session(session);
      if (!product) {
        await session.abortTransaction();
        session.endSession();
        return res.status(404).json({ message: `Product with ID ${item_id} not found` });
      }

      // Check if there is enough stock
      if (product.countInStock < quantity) {
        await session.abortTransaction();
        session.endSession();
        return res.status(400).json({ message: `Insufficient stock for product ID ${item_id}` });
      }

      // Deduct the stock
      product.countInStock -= parseFloat(quantity);
      productUpdatePromises.push(product.save({ session }));
    }

    // Save the updated bill
    await existingBill.save({ session });

    // Update all product stock counts
    await Promise.all(productUpdatePromises);

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    res.json({ message: 'Bill approved successfully', bill: existingBill });
  } catch (error) {
    console.error('Error approving bill:', error);

    // Abort transaction on error
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();

    res.status(500).json({ error: 'Internal server error', details: error.message });
  }
});




// Get all billings
  billingRouter.get('/', async (req, res) => {
    try {
      // Fetch and sort billing records by createdAt field in descending order (newest first)
      const billings = await Billing.find().sort({ createdAt: -1 });
  
      if (!billings) {
        return res.status(404).json({ message: 'No billings found' });
      }
  
      res.status(200).json(billings);
    } catch (error) {
      console.error('Error fetching billings:', error);
      res.status(500).json({ message: 'Error fetching billings', error: error.message });
    }
  });
  


billingRouter.get('/driver/', async (req, res) => {
  const page = parseFloat(req.query.page) || 1; // Default to page 1
  const limit = parseFloat(req.query.limit) || 3; // Default to 10 items per page

  try {
    const totalBillings = await Billing.countDocuments(); // Get total billing count
    const billings = await Billing.find()
      .sort({ invoiceDate: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({
      billings,
      totalPages: Math.ceil(totalBillings / limit),
      currentPage: page,
      totalbilling: totalBillings
    });
  } catch (error) {
    console.error("Error fetching billings:", error);
    res.status(500).json({ message: "Error fetching billings" });
  }
});


billingRouter.get('/product/get-sold-out/:id', async (req, res) => {
  const itemId = req.params.id.trim();

  try {
    const totalQuantity = await Billing.getTotalQuantitySold(itemId);

    // Always return a result, even if no sales are found
    res.status(200).json({ itemId, totalQuantity });
  } catch (error) {
    console.error("Error occurred while fetching total quantity sold:", error);
    res.status(500).json({ message: "An error occurred while fetching the data.", error: error.message });
  }
});




// Get a billing by ID
billingRouter.get('/:id', async (req, res) => {
  try {
    const billing = await Billing.findById(req.params.id);
    if (!billing) {
      return res.status(500).json({ message: 'Billing not found' });
    }
    res.status(200).json(billing);
  } catch (error) {
    console.error('Error fetching billing:', error);
    res.status(500).json({ message: 'Error fetching billing', error });
  }
});


billingRouter.get('/getinvoice/:id', async (req, res) => {
  try {
    const billing = await Billing.findOne({invoiceNo: req.params.id});
    if (!billing) {
      console.log("not found")
      return res.status(500).json({ message: 'Billing not found' });
    }
    res.status(200).json(billing);
  } catch (error) {
    console.error('Error fetching billing:', error);
    res.status(500).json({ message: 'Error fetching billing', error });
  }
});


// Fetch all billing numbers
billingRouter.get('/numbers/getBillings', async (req, res) => {
  try {
    const billings = await Billing.find({}, { invoiceNo: 1 }); // Fetch only billingNo
    res.status(200).json(billings);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching billing numbers', error });
  }
});


billingRouter.put("/driver/billings/:id", async (req, res) => {
  const { deliveryStatus, paymentStatus } = req.body;
  try {
    const updatedBilling = await Billing.findByIdAndUpdate(
      req.params.id,
      { deliveryStatus, paymentStatus },
      { new: true }
    );
    res.status(200).json(updatedBilling);
  } catch (error) {
    res.status(500).json({ message: "Error updating billing", error });
  }
});

// Route to fetch a limited number of low-stock products (e.g., for homepage)
billingRouter.get('/deliveries/expected-delivery', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set the time to the start of today (00:00:00)

    const billings = await Billing.find({expectedDeliveryDate: { $gte: today },deliveryStatus: { $ne: 'Delivered' }}).sort({ expectedDeliveryDate: 1 }).limit(1); // Limit to 3 products
    // console.log(billings)
    res.json(billings);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching low-stock products', error });
  }
});

billingRouter.get('/alldelivery/all', async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0); // Set the time to the start of today (00:00:00)
    const billings = await Billing.find({expectedDeliveryDate: {$gte: today}, deliveryStatus: { $ne: 'Delivered' }}).sort({ expectedDeliveryDate: 1 }) // Limit to 3 products
    // console.log(billings)
    res.json(billings);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching low-stock products', error });
  }
});


billingRouter.get("/billing/suggestions", async (req, res) => {
  try {
    let { search = "" } = req.query;
    search = search.replace(/\s+/g, "").toUpperCase(); // Normalize the search term

    // Search both `invoiceNo` and `customerName` fields with case insensitive regex
    const suggestions = await Billing.find({
      $or: [
        { invoiceNo: { $regex: search, $options: "i" } },
        { customerName: { $regex: search, $options: "i" } }
      ]
    }).sort({ invoiceNo: -1 }).collation({ locale: "en", numericOrdering: true }).limit(5); // Limit suggestions to 5

    res.status(200).json(suggestions);
  } catch (error) {
    console.error("Error fetching suggestions:", error); // Log the error for debugging
    res.status(500).json({ message: "Error fetching suggestions" });
  }
});


billingRouter.get("/billing/driver/suggestions", async (req, res) => {
  try {
    let { search = "" } = req.query;
    search = search.replace(/\s+/g, "").toUpperCase(); // Normalize the search term

    // Search both `invoiceNo` and `customerName` fields with case insensitive regex
    const suggestions = await Billing.find({
      $and: [
        {
          $or: [
            { invoiceNo: { $regex: search, $options: "i" } },
            { customerName: { $regex: search, $options: "i" } }
          ]
        },
        { deliveryStatus: { $nin: [ "Delivered"] } } // Filter only 'Sent' status
      ]
    })
      .sort({ invoiceNo: -1 })
      .collation({ locale: "en", numericOrdering: true })
      .limit(5); // Limit suggestions to 5

    res.status(200).json(suggestions);
  } catch (error) {
    console.error("Error fetching suggestions:", error); // Log the error for debugging
    res.status(500).json({ message: "Error fetching suggestions" });
  }
});



billingRouter.get('/lastOrder/id', async (req, res) => {
  try {
    // Fetch the invoice with the highest sequence number starting with 'K'
    const billing = await Billing.findOne({ invoiceNo: /^KK\d+$/ })
      .sort({ invoiceNo: -1 })
      .collation({ locale: "en", numericOrdering: true });

      let lastGeneratedCustomer;

      if(billing){

      lastGeneratedCustomer = await CustomerAccount.aggregate([
        {
          $addFields: {
            numericId: {
              $toInt: {
                $cond: {
                  if: { $regexMatch: { input: "$customerId", regex: /^CUS\d+$/ } }, // Check if format matches
                  then: { $substr: ["$customerId", 4, -1] }, // Extract numeric part
                  else: "0" // Default to 0 for invalid or missing customerId
                }
              }
            }
          }
        },
        {
          $sort: { numericId: -1 } // Sort by numericId in descending order
        },
        {
          $limit: 1 // Get the record with the highest numericId
        }
      ]);
    }
      

      let lastInvoice = 'KK0'
      let lastCustomerId = 'CUS0'

      if(billing){
        lastInvoice = billing.invoiceNo
      }

      if(lastGeneratedCustomer){
        lastCustomerId = lastGeneratedCustomer[0].customerId
      }
    
      res.json({lastInvoice, lastCustomerId});
  } catch (error) {
    console.log(error)
    res.status(500).json({ message: 'Error fetching last order' });
  }
});




billingRouter.post("/billing/:id/addExpenses", async (req, res) => {
  try {
    const { id } = req.params;
    const { fuelCharge = 0, otherExpenses = [], paymentMethod, userId } = req.body;

    // Find the billing document by ID
    const billing = await Billing.findById(id);
    if (!billing) {
      return res.status(404).json({ message: "Billing not found" });
    }

    // Update fuelCharge by adding the new value to the existing one
    billing.fuelCharge = parseFloat(billing.fuelCharge) + parseFloat(fuelCharge || 0);

    // Validate and filter otherExpenses to include only entries with a positive amount
    const validOtherExpenses = Array.isArray(otherExpenses)
      ? otherExpenses.filter(expense => 
          typeof expense === "object" && 
          expense !== null && 
          typeof expense.amount === "number" && 
          expense.amount > 0
        )
      : [];

    // Append valid otherExpenses to the billing document
    if (validOtherExpenses.length > 0) {
      billing.otherExpenses.push(...validOtherExpenses.map(expense => ({
        amount: parseFloat(expense.amount),
        remark: expense.remark || ""
      })));
    }
  
    try {
      const account = await PaymentsAccount.findOne({ accountId: paymentMethod });
    
      if (!account) {
        console.log(`No account found for accountId: ${paymentMethod}`);
        return res.status(404).json({ message: 'Payment account not found' });
      }
    
      account.paymentsOut.push(...validOtherExpenses.map(expense => ({
        amount: parseFloat(expense.amount),
        remark: `Other Expense For Bill ${billing.invoiceNo} : ${expense.remark}`,
        method: paymentMethod,
        submittedBy: userId
      })));

      const parsedfuelCharge = parseFloat(fuelCharge)

      if(parsedfuelCharge > 0){
        account.paymentsOut.push({
          amount: parsedfuelCharge,
          remark:`${billing.invoiceNo} : Fuel Charge`,
          method: paymentMethod,
          submittedBy: userId
        });
      }
    
      await account.save();
    } catch (error) {
      console.log('Error processing payment:', error);
      return res.status(500).json({ message: 'Error processing payment', error });
    }

    // Save the updated document
    await billing.save();

    res.status(200).json({ message: "Expenses added successfully", billing });
  } catch (error) {
    console.error("Error adding expenses:", error);
    res.status(500).json({ message: "Error adding expenses" });
  }
});


billingRouter.get('/summary/monthly-sales', async (req, res) => {
  try {
    const sales = await Billing.aggregate([
      {
        $group: {
          _id: { $month: '$invoiceDate' },
          totalSales: { $sum: '$billingAmount' },
        },
      },
      { $sort: { '_id': 1 } },
    ]);

    res.json(sales);
  } catch (error) {
    console.error('Error fetching monthly sales data:', error);
    res.status(500).json({ message: 'Error fetching monthly sales data' });
  }
});

// GET Total Billing Sum
billingRouter.get('/summary/total-sales', async (req, res) => {
  try {
    const totalSales = await Billing.aggregate([
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$billingAmount' },
        },
      },
    ]);

    res.json({
      totalSales: totalSales.length > 0 ? totalSales[0].totalAmount : 0,
    });
  } catch (error) {
    console.error('Error fetching total sales:', error);
    res.status(500).json({ message: 'Error fetching total sales' });
  }
});

billingRouter.get('/purchases/suggestions', async (req, res) => {
  try {
    const searchTerm = req.query.q;
    if (!searchTerm) {
      return res.status(400).json({ error: 'Query parameter q is required' });
    }

    // Use aggregation to group by sellerId and ensure uniqueness
    const sellers = await SupplierAccount.aggregate([
      {
        $match: {
          sellerName: { $regex: searchTerm, $options: 'i' }
        }
      },
      {
        $group: {
          _id: '$sellerId',
          sellerName: { $first: '$sellerName' },
          sellerAddress: { $first: '$sellerAddress' },
          sellerGst: { $first: '$sellerGst' },
          sellerId: { $first: '$sellerId' }
        }
      },
      {
        $limit: 10 // Limit to 10 unique suggestions for performance
      }
    ]);

    const suggestions = sellers.map(seller => ({
      sellerName: seller.sellerName,
      sellerAddress: seller.sellerAddress,
      sellerGst: seller.sellerGst,
      sellerId: seller.sellerId
    }));

    res.json({ suggestions });
  } catch (error) {
    console.error('Error fetching seller suggestions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});



billingRouter.get('/purchases/categories', async (req, res) => {
  try {
    // Fetch distinct categories from previous purchase bills
    const categories = await Product.distinct('category');
    res.json({categories});
  } catch (error) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});



billingRouter.get('/deliveries/all', async (req, res) => {
  try {
    const { userId, invoiceNo, driverName } = req.query;

    let query = {};
    if (invoiceNo) {
      query.invoiceNo = { $regex: invoiceNo, $options: 'i' };
    }

    if (driverName) {
      query['deliveries.driverName'] = { $regex: driverName, $options: 'i' };
    }

    if (userId) {
      query['deliveries.userId'] = { $in: Array.isArray(userId) ? userId : [userId] };
    }

    const billings = await Billing.find(query).lean();

    const deliveries = billings.flatMap(billing =>
      billing.deliveries
        .filter(delivery => !driverName || delivery.driverName === driverName)
        .map(delivery => ({
          invoiceNo: billing.invoiceNo,
          customerName: billing.customerName,
          customerAddress: billing.customerAddress,
          billingAmount: billing.billingAmount,
          paymentStatus: billing.paymentStatus,
          deliveryStatus: delivery.deliveryStatus,
          deliveryId: delivery.deliveryId,
          driverName: delivery.driverName,
          kmTravelled: delivery.kmTravelled,
          startingKm: delivery.startingKm,
          endKm: delivery.endKm,
          fuelCharge: delivery.fuelCharge,
          otherExpenses: delivery.otherExpenses,
          productsDelivered: delivery.productsDelivered,
        }))
    );

    res.json(deliveries);
  } catch (error) {
    console.error('Error fetching deliveries:', error);
    res.status(500).json({ message: 'Error fetching deliveries.' });
  }
});




// DELETE /api/billing/deliveries/:deliveryId
billingRouter.delete('/deliveries/:deliveryId', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { deliveryId } = req.params;

    if (!deliveryId) {
      throw new Error('Delivery ID is required.');
    }

    // Find the Billing document containing the delivery
    const billing = await Billing.findOne({ 'deliveries.deliveryId': deliveryId }).session(session);
    if (!billing) {
      throw new Error('Billing document not found.');
    }

    // Find the specific delivery entry
    const delivery = billing.deliveries.find(d => d.deliveryId === deliveryId);
    if (!delivery) {
      throw new Error('Delivery not found.');
    }

    // Reset delivered quantities to 0 for associated products
    delivery.productsDelivered.forEach(dp => {
      const product = billing.products.find(p => p.item_id === dp.item_id);
      if (product) {
        product.deliveredQuantity = 0;
        product.deliveryStatus = "Pending";
      }
    });

    // Remove the delivery from the deliveries array
    billing.deliveries = billing.deliveries.filter(d => d.deliveryId !== deliveryId);

    // Remove associated paymentsOut from PaymentsAccount
    if (delivery.method && delivery.method.trim()) {
      const expenseMethod = delivery.method.trim();
      const account = await PaymentsAccount.findOne({ accountId: expenseMethod }).session(session);
      if (account) {
        // Remove paymentsOut related to this delivery
        const fuelRefId = `FUEL-${deliveryId}`;
        const expenseRefIds = delivery.otherExpenses.map(e => `EXP-${e._id}`);

        account.paymentsOut = account.paymentsOut.filter(
          pay => pay.referenceId !== fuelRefId && !expenseRefIds.includes(pay.referenceId)
        );

        await account.save({ session });
      }
    }

    // Remove the delivery's otherExpenses from billing.otherExpenses
    billing.otherExpenses = billing.otherExpenses.filter(exp => {
      // Keep expenses not related to this delivery
      return !delivery.otherExpenses.some(dExp => String(dExp._id) === String(exp._id));
    });

    // Recalculate overall delivery status
    await billing.updateDeliveryStatus();

    // Save the updated Billing document
    await billing.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({ message: 'Delivery deleted successfully and related data updated.' });
  } catch (error) {
    console.error('Error deleting delivery:', error);
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    res.status(500).json({ message: error.message || 'Error deleting delivery.' });
  }
});


// PUT /api/users/billing/update-delivery

billingRouter.put('/update-delivery/update', async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    console.log('Received update request:', req.body);

    const {
      deliveryId,
      startingKm,
      endKm,
      fuelCharge,
      method, // Payment method for expenses (optional)
      updatedOtherExpenses = [],
      deliveredProducts = [],
    } = req.body;

    // Validate required fields
    if (!deliveryId) {
      throw new Error('Delivery ID is required.');
    }

    // Find the Billing document containing the delivery
    const billing = await Billing.findOne({ 'deliveries.deliveryId': deliveryId }).session(session);
    if (!billing) {
      throw new Error('Billing document not found.');
    }

    // Find the specific delivery entry
    const delivery = billing.deliveries.find((d) => d.deliveryId === deliveryId);
    if (!delivery) {
      throw new Error('Delivery not found.');
    }

    // Update startingKm, endKm if provided and valid
    if (startingKm !== undefined && !isNaN(parseFloat(startingKm))) {
      delivery.startingKm = parseFloat(startingKm);
    }

    if (endKm !== undefined && !isNaN(parseFloat(endKm))) {
      delivery.endKm = parseFloat(endKm);
    }

    // Recalculate kmTravelled
    if (!isNaN(delivery.startingKm) && !isNaN(delivery.endKm)) {
      delivery.kmTravelled = delivery.endKm - delivery.startingKm;
      if (delivery.kmTravelled < 0) {
        throw new Error("endKm cannot be less than startingKm.");
      }
    }

    // Update fuelCharge
    if (fuelCharge !== undefined && !isNaN(parseFloat(fuelCharge))) {
      delivery.fuelCharge = parseFloat(fuelCharge);
      billing.fuelCharge = parseFloat(fuelCharge);
    }

    // Update Delivered Products Quantities
    if (!Array.isArray(deliveredProducts)) {
      throw new Error("deliveredProducts must be an array.");
    }

    for (const dp of deliveredProducts) {
      const { item_id, deliveredQuantity } = dp;
      if (!item_id || typeof deliveredQuantity !== 'number' || deliveredQuantity < 0) {
        throw new Error("Each deliveredProduct must have a valid item_id and a non-negative deliveredQuantity.");
      }

      const product = billing.products.find(p => p.item_id === item_id);
      if (!product) {
        throw new Error(`Product with item_id ${item_id} not found in billing.`);
      }

      if (deliveredQuantity > product.quantity) {
        throw new Error(`Delivered quantity for product ${item_id} exceeds the ordered quantity.`);
      }

      product.deliveredQuantity = deliveredQuantity;
      // Update product deliveryStatus
      if (deliveredQuantity === product.quantity) {
        product.deliveryStatus = "Delivered";
      } else if (deliveredQuantity > 0 && deliveredQuantity < product.quantity) {
        product.deliveryStatus = "Partially Delivered";
      } else {
        product.deliveryStatus = "Pending";
      }

      // Update delivery.productsDelivered
      const deliveredProduct = delivery.productsDelivered.find(p => p.item_id === item_id);
      if (deliveredProduct) {
        deliveredProduct.deliveredQuantity = deliveredQuantity;
      } else {
        delivery.productsDelivered.push({
          item_id,
          deliveredQuantity,
        });
      }
    }

    // Process updated other expenses (Full CRUD)
    const existingExpenseIds = delivery.otherExpenses.map(e => e._id.toString());
    const updatedExpenseIds = updatedOtherExpenses.filter(exp => exp.id).map(exp => exp.id.toString());
    const expensesToRemoveIds = existingExpenseIds.filter(id => !updatedExpenseIds.includes(id));

    // Remove old expenses not in updated list
    if (expensesToRemoveIds.length > 0) {
      delivery.otherExpenses = delivery.otherExpenses.filter(e => !expensesToRemoveIds.includes(e._id.toString()));
      billing.otherExpenses = billing.otherExpenses.filter(e => !expensesToRemoveIds.includes(e._id.toString()));
    }

    // Add or update expenses
    for (const expense of updatedOtherExpenses) {
      const parsedAmount = parseFloat(expense.amount);
      if (isNaN(parsedAmount) || parsedAmount < 0) {
        throw new Error("Expense amount must be a non-negative number.");
      }

      if (expense.id) {
        // Update existing expense by id
        const existingExpense = delivery.otherExpenses.find((e) => e._id.toString() === expense.id.toString());
        if (!existingExpense) {
          throw new Error(`Expense with id ${expense.id} not found in this delivery.`);
        }
        existingExpense.amount = parsedAmount;
        existingExpense.remark = expense.remark || existingExpense.remark;
        if (method && method.trim()) {
          existingExpense.method = method.trim();
        }

        // Update top-level billing.otherExpenses
        const billingExpense = billing.otherExpenses.find((e) => e._id.toString() === expense.id.toString());
        if (billingExpense) {
          billingExpense.amount = parsedAmount;
          billingExpense.remark = expense.remark || billingExpense.remark;
          if (method && method.trim()) {
            billingExpense.method = method.trim();
          }
        }

      } else {
        // Add new expense
        const newExpenseId = new mongoose.Types.ObjectId();
        const newExpense = {
          _id: newExpenseId,
          amount: parsedAmount,
          remark: expense.remark || 'No remark provided',
          date: new Date(),
          method: method && method.trim() ? method.trim() : undefined,
        };
        delivery.otherExpenses.push(newExpense);
        billing.otherExpenses.push(newExpense);
      }
    }

    // Recalculate overall delivery status
    await billing.updateDeliveryStatus();

    // If a method is provided, update PaymentsAccount with fuelCharge & otherExpenses
    if (method && method.trim()) {
      const expenseMethod = method.trim();
      const account = await PaymentsAccount.findOne({ accountId: expenseMethod }).session(session);
      if (!account) {
        throw new Error('Payment account not found for the given method.');
      }

      // Handle Fuel Charge
      const fuelRefId = `FUEL-${deliveryId}`;
      account.paymentsOut = account.paymentsOut.filter((pay) => pay.referenceId !== fuelRefId);
      if (delivery.fuelCharge > 0) {
        account.paymentsOut.push({
          amount: delivery.fuelCharge,
          method: expenseMethod,
          referenceId: fuelRefId,
          remark: `Fuel charge for delivery ${deliveryId}`,
          submittedBy: delivery.userId || "system",
          date: new Date(),
        });
      }

      // Handle Other Expenses
      const currentExpenseRefs = delivery.otherExpenses.map(e => `EXP-${e._id}`);
      account.paymentsOut = account.paymentsOut.filter(pay => {
        if (pay.referenceId.startsWith("EXP-")) {
          return currentExpenseRefs.includes(pay.referenceId);
        }
        return true;
      });

      for (const exp of delivery.otherExpenses) {
        if (exp.amount > 0) {
          const expenseRefId = `EXP-${exp._id}`;
          const existingPaymentIndex = account.paymentsOut.findIndex(pay => pay.referenceId === expenseRefId);
          if (existingPaymentIndex >= 0) {
            // Update existing paymentOut
            account.paymentsOut[existingPaymentIndex].amount = exp.amount;
            account.paymentsOut[existingPaymentIndex].method = expenseMethod;
            account.paymentsOut[existingPaymentIndex].remark = `Expense (${exp.remark}) for delivery ${deliveryId}`;
            account.paymentsOut[existingPaymentIndex].submittedBy = delivery.userId || "system";
            account.paymentsOut[existingPaymentIndex].date = new Date();
          } else {
            // Add new paymentOut
            account.paymentsOut.push({
              amount: exp.amount,
              method: expenseMethod,
              referenceId: expenseRefId,
              remark: `Expense (${exp.remark}) for delivery ${deliveryId}`,
              submittedBy: delivery.userId || "system",
              date: new Date(),
            });
          }
        }
      }

      await account.save({ session });
    }

    // Save the updated Billing document
    await billing.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({ message: 'Delivery and billing updated successfully.', data: billing });
  } catch (error) {
    console.error('Error updating delivery and billing:', error);
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    res.status(500).json({ message: error.message || 'Error updating delivery and billing.' });
  }
});




billingRouter.post('/bill/cancel', async (req, res) => {
  try{
    const bill = await Billing.findOne({invoiceNo: req.body.invoiceNo})
    if(bill){
     await bill.save();
    }else{
      res.status(404).json({ message: "not found" })
    }

    await bill.save()
  }catch(error){
    res.status(500).json({message: "error occured"})
  }
});


// =========================
// Route: Get Customer Suggestions
// =========================

// Utility function to escape regex special characters

billingRouter.get('/customer/suggestions', async (req, res) => {
  const { search, suggestions } = req.query;
  
  // Validate query parameters
  if (suggestions !== "true" || !search) {
    return res.status(400).json({
      message: "Invalid request. Please provide both 'search' and set 'suggestions' to 'true'."
    });
  }
  
  try {
    const escapeRegex = (text) => text.replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');
    // Sanitize and create a case-insensitive regex
    const safeSearch = escapeRegex(search);
    const regex = new RegExp(safeSearch, 'i');

    // Fetch matching customers using aggregation for deduplication
    const customers = await CustomerAccount.aggregate([
      {
        $match: {
          $or: [
            { customerName: { $regex: regex } },
            { customerContactNumber: { $regex: regex } }
          ]
        }
      },
      {
        $group: {
          _id: {
            customerName: "$customerName",
            customerContactNumber: "$customerContactNumber",
            customerAddress: "$customerAddress",
            customerId: "$customerId"
          },
          doc: { $first: "$$ROOT" }
        }
      },
      {
        $replaceRoot: { newRoot: "$doc" }
      },
      {
        $project: {
          _id: 1,
          customerName: 1,
          customerContactNumber: 1,
          customerAddress: 1,
          customerId: 1,
        }
      },
      {
        $limit: 4
      }
    ]);

    res.json({ suggestions: customers });
  } catch (error) {
    console.error('Error fetching customer suggestions:', error);
    res.status(500).json({ message: 'Internal server error' });
  }
});


billingRouter.get('/sort/sales-report', async (req, res) => {
  try {
    const {
      fromDate,
      toDate,
      customerName,
      salesmanName,
      invoiceNo,
      paymentStatus,
      deliveryStatus,
      itemName,
      amountThreshold,
      sortField,
      sortDirection,
    } = req.query;

    let filter = {};

    // Filter by date range
    if (fromDate || toDate) {
      filter.invoiceDate = {};
      if (fromDate) {
        filter.invoiceDate.$gte = new Date(fromDate);
      }
      if (toDate) {
        filter.invoiceDate.$lte = new Date(toDate);
      }
    }

    // Filter by customer name
    if (customerName) {
      filter.customerName = { $regex: customerName, $options: 'i' };
    }

    // Filter by salesman name
    if (salesmanName) {
      filter.salesmanName = { $regex: salesmanName, $options: 'i' };
    }

    // Filter by invoice number
    if (invoiceNo) {
      filter.invoiceNo = { $regex: invoiceNo, $options: 'i' };
    }

    // Filter by payment status
    if (paymentStatus) {
      filter.paymentStatus = paymentStatus;
    }

    // Filter by delivery status
    if (deliveryStatus) {
      filter.deliveryStatus = deliveryStatus;
    }

    // Filter by item name
    if (itemName) {
      filter['products.name'] = { $regex: itemName, $options: 'i' };
    }

    // Filter by amount threshold
    if (amountThreshold) {
      filter.billingAmount = { $gte: parseFloat(amountThreshold) };
    }

    // Sorting
    let sort = {};
    if (sortField) {
      sort[sortField] = sortDirection === 'asc' ? 1 : -1;
    } else {
      sort = { invoiceDate: -1 }; // Default sorting
    }

    // Fetch billings with filters and sorting
    const billings = await Billing.find(filter).sort(sort);

    res.json(billings);
  } catch (error) {
    console.error('Error fetching billings:', error);
    res.status(500).json({ message: 'Server error' });
  }
});







export default billingRouter;
