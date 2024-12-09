import express from 'express';
import expressAsyncHandler from 'express-async-handler';
import bcrypt from 'bcryptjs';
import data from '../data.js';
import User from '../models/userModel.js';
import { generateToken, isAdmin, isAuth } from '../utils.js';
import AttendenceModel from '../models/attendenceModel.js';
import Location from '../models/locationModel.js'
import Billing from '../models/billingModal.js';
import Product from '../models/productModel.js';
import Log from '../models/Logmodal.js';
import PaymentsAccount from '../models/paymentsAccountModal.js';
import CustomerAccount from '../models/customerModal.js';
import mongoose from 'mongoose';

const userRouter = express.Router();


userRouter.get(
  '/top-sellers',
  expressAsyncHandler(async (req, res) => {
    const topSellers = await User.find({ isSeller: true })
      .sort({ 'seller.rating': -1 })
      .limit(3);
    res.send(topSellers);
  })
);

userRouter.get(
  '/seed',
  expressAsyncHandler(async (req, res) => {
    // await User.remove({});
    const createdUsers = await User.insertMany(data.users);
    res.send({ createdUsers });
  })
);

userRouter.post(
  '/signin',
  expressAsyncHandler(async (req, res) => {
    const user = await User.findOne({ email: req.body.email });
    const attendance = new AttendenceModel({ userId:  user._id});
    await attendance.save();
    if (user) {
      if (bcrypt.compareSync(req.body.password, user.password)) {
        res.send({
          _id: user._id,
          name: user.name,
          email: user.email,
          isAdmin: user.isAdmin,
          isSeller: user.isSeller,
          token: generateToken(user),
          attendence: attendance
        });
        return;
      }
    }
    res.status(401).send({ message: 'Invalid email or password' });
  })
);





// Get today's attendance for a specific user
userRouter.get('/attendance/today/:userId', async (req, res) => {
  const { userId } = req.params;

  // Get the current date (start and end of day)
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0); // Start of day at 00:00:00
  const endOfDay = new Date();
  endOfDay.setHours(23, 59, 59, 999); // End of day at 23:59:59

  try {
    // Find the attendance for today
    const attendance = await AttendenceModel.findOne({
      userId,
      loginTime: { $gte: startOfDay, $lte: endOfDay },
    });

    if (!attendance) {
      return res.status(404).json({ message: 'No attendance record found for today' });
    }

    res.status(200).json(attendance);
  } catch (error) {
    res.status(500).json({ message: 'Error fetching attendance', error: error.message });
  }
});


userRouter.post('/logout/:userId', async (req, res) => {
  const { userId } = req.params;

  // Find today's attendance record for the user
  const attendance = await AttendenceModel.findOne({
    userId,
    logoutTime: null, // Ensure we are only updating the active session
  });

  if (!attendance) {
    return res.status(200).send('No active session found');
  }

  // // Record logout time
  attendance.logoutTime = new Date();
  await attendance.save();

  res.status(200).send({ message: 'Logout successful' });

});



userRouter.post(
  '/register',
  expressAsyncHandler(async (req, res) => {
    const user = new User({
      name: req.body.name,
      email: req.body.email,
      password: bcrypt.hashSync(req.body.password, 8),
    });
    const createdUser = await user.save();
    res.send({
      _id: createdUser._id,
      name: createdUser.name,
      email: createdUser.email,
      isAdmin: createdUser.isAdmin,
      isSeller: user.isSeller,
      token: generateToken(createdUser),
    });
  })
);





userRouter.put(
  '/profile',
  isAuth,
  expressAsyncHandler(async (req, res) => {
    const user = await User.findById(req.body._id);
    if (user) {
      user.name = req.body.name || user.name;
      user.email = req.body.email || user.email;
      if (user.isSeller) {
        user.seller.name = req.body.sellerName || user.seller.name;
        user.seller.logo = req.body.sellerLogo || user.seller.logo;
        user.seller.description =
          req.body.sellerDescription || user.seller.description;
      }
      if (req.body.password) {
        user.password = bcrypt.hashSync(req.body.password, 8);
      }
      const updatedUser = await user.save();
      res.send({
        _id: updatedUser._id,
        name: updatedUser.name,
        email: updatedUser.email,
        isAdmin: updatedUser.isAdmin,
        isSeller: user.isSeller,
        token: generateToken(updatedUser),
      });
    }
  })
);

userRouter.get(
  '/',
  isAuth,
  isAdmin,
  expressAsyncHandler(async (req, res) => {
    const users = await User.find({});
    res.send(users);
  })
);

userRouter.delete(
  '/:id',
  isAuth,
  isAdmin,
  expressAsyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (user) {
      if (user.email === 'admin@example.com') {
        res.status(400).send({ message: 'Can Not Delete Admin User' });
        return;
      }
      const deleteUser = await user.remove();
      res.send({ message: 'User Deleted', user: deleteUser });
    } else {
      res.status(404).send({ message: 'User Not Found' });
    }
  })
);

userRouter.get('/:id',
  expressAsyncHandler(async (req,res)=>{
    try{
      const user = await User.findById(req.params.id)
      if(user){
        res.json(user)
      }else{
        res.status(404).send({msg: "User Not Found"})
      }
    }catch(error){
      res.status(500).send({msg: "Error Occured"})
    }
  })
)

userRouter.get('/user/:id',
  expressAsyncHandler(async (req,res)=>{
    try{
      const user = await User.findById(req.params.id)
      if(user){
        res.json(user)
      }else{
        res.status(404).send({msg: "User Not Found"})
      }
    }catch(error){
      res.statsu(500).send({msg: "Error Occured"})
    }
  })
)

userRouter.put(
  '/:id',
  isAuth,
  isAdmin,
  expressAsyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (user) {
      user.name = req.body.name || user.name;
      user.email = req.body.email || user.email;
      user.isSeller = Boolean(req.body.isSeller);
      user.isAdmin = Boolean(req.body.isAdmin);
      // user.isAdmin = req.body.isAdmin || user.isAdmin;
      const updatedUser = await user.save();
      res.send({ message: 'User Updated', user: updatedUser });
    } else {
      res.status(404).send({ message: 'User Not Found' });
    }
  })
);


userRouter.get('/get-face-data/:id', async (req,res) =>{
  const userId = req.params.id

  try{
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }else if(user.faceDescriptor){
      return res.status(200).json(user)
    }
  }catch (error) {
    return res.status(404).json({ message: 'Error Occured' });
  }


})



userRouter.post('/register-face/:id', async (req, res) => {
  const { faceDescriptor } = req.body;

  try {
    // Find the user in the database
    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    user.faceDescriptor = faceDescriptor
    await user.save();
    res.status(200).json({message: "successfull"})

  } catch (error) {
    console.error('Error during face recognition:', error);
    res.status(500).json({ message: 'Server error' });
  }

});


// Face recognition endpoint (receives face descriptor from frontend)
userRouter.post('/recognize-face/:id', async (req, res) => {
  const userId = req.params.id;
  const { faceDescriptor } = req.body;

  try {
    // Find the user in the database
    const user = await User.findById(userId);

    if (!user || !user.faceDescriptor) {
      return res.status(404).json({ message: 'User not found' });
    }

    function euclideanDistance(descriptor1, descriptor2) {
      let sum = 0;
      for (let i = 0; i < descriptor1.length; i++) {
        sum += (descriptor1[i] - descriptor2[i]) ** 2;
      }
      return Math.sqrt(sum);
    }

    // Compare face descriptors using Euclidean distance
    const distance = euclideanDistance(user.faceDescriptor, faceDescriptor);

    if (distance < 0.6) {  // Threshold value for matching
      console.log("SUCCESSS")
      return res.status(200).json({ message: 'Face matched successfully!' });
    } else {
      console.log("FAIL")
      return res.status(404).send({ message: 'Face did not match' });
    }

    
  } catch (error) {
    console.error('Error during face recognition:', error);
    res.status(500).json({ message: 'Server error' });
  }
});


userRouter.get('/location/users', async (req, res) => {
  try {
      const locations = await Location.find();
      res.status(200).json(locations);
  } catch (error) {
      res.status(500).json({ message: 'Error fetching locations' });
  }
});


// Start Delivery Endpoint
userRouter.post("/billing/start-delivery", async (req, res) => {
  try {
    const { userId, driverName, invoiceNo, startLocation, deliveryId } = req.body;

    // Ensure all required fields are present
    if (!userId || !driverName || !invoiceNo || !startLocation || !deliveryId) {
      return res.status(400).json({ error: "All fields are required." });
    }

    // Find the Billing document by invoiceNo
    const billing = await Billing.findOne({ invoiceNo });
    if (!billing) {
      return res.status(404).json({ error: "Billing not found." });
    }

    // Check if the deliveryId already exists in billing.deliveries
    let delivery = billing.deliveries.find(d => d.deliveryId === deliveryId);

    if (!delivery) {
      // Create a new delivery entry
      delivery = {
        deliveryId,
        userId,
        driverName,
        startLocations: [{ coordinates: startLocation, timestamp: new Date() }],
        endLocations: [],
        productsDelivered: [],
        deliveryStatus: "Transit-In",
        kmTravelled: 0,
        startingKm: 0,
        endKm: 0,
        fuelCharge: 0,
        otherExpenses: [],
      };
      billing.deliveries.push(delivery);
    } else {
      // Update existing delivery entry with new start location
      delivery.startLocations.push({ coordinates: startLocation, timestamp: new Date() });
      delivery.deliveryStatus = "Transit-In";
    }

    await billing.save();

    // Find or create a Location document for this delivery attempt
    let location = await Location.findOne({ deliveryId });

    if (!location) {
      // Create a new Location document
      location = new Location({
        userId,
        driverName,
        invoiceNo,
        deliveryId,
        startLocations: [{ coordinates: startLocation, timestamp: new Date() }],
        endLocations: [],
      });
    } else {
      // Add the new start location to the existing document
      location.startLocations.push({ coordinates: startLocation, timestamp: new Date() });
    }

    await location.save();

    res.status(200).json({
      message: "Start location and delivery status updated successfully.",
      delivery,
    });

  } catch (error) {
    console.error("Error saving start location and updating delivery status:", error);
    res.status(500).json({ error: "Failed to save start location and update delivery status." });
  }
});

// End Delivery Endpoint
userRouter.post("/billing/end-delivery", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const {
      userId,
      invoiceNo,
      endLocation,
      deliveredProducts = [],
      kmTravelled = 0,
      fuelCharge = 0,
      otherExpenses = [],
      startingKm = 0,
      endKm = 0,
      deliveryId,
      method // Payment method for expenses
    } = req.body;

    // Validate required fields
    if (!userId || !invoiceNo || !endLocation || !deliveryId) {
      throw new Error("userId, invoiceNo, endLocation, and deliveryId are required.");
    }

    if (!Array.isArray(deliveredProducts) || deliveredProducts.length === 0) {
      throw new Error("deliveredProducts must be a non-empty array.");
    }

    // Find the Billing document by invoiceNo
    const billing = await Billing.findOne({ invoiceNo }).session(session);
    if (!billing) {
      throw new Error("Billing not found.");
    }

    // Find the corresponding delivery entry
    const delivery = billing.deliveries.find(d => d.deliveryId === deliveryId);
    if (!delivery) {
      throw new Error("Delivery not found for this deliveryId.");
    }

    // Update delivered products (incremental logic)
    for (const dp of deliveredProducts) {
      const product = billing.products.find((p) => p.item_id === dp.item_id);
      if (!product) {
        throw new Error(`Product with item_id ${dp.item_id} not found in billing.`);
      }

      const previousDeliveredQuantity = product.deliveredQuantity || 0;
      const totalDeliveredQuantity = previousDeliveredQuantity + dp.deliveredQuantity;

      if (totalDeliveredQuantity > product.quantity) {
        throw new Error(`Delivered quantity for item ${dp.item_id} exceeds ordered amount.`);
      }

      product.deliveredQuantity = totalDeliveredQuantity;
      if (totalDeliveredQuantity === product.quantity) {
        product.deliveryStatus = "Delivered";
      } else if (totalDeliveredQuantity > 0) {
        product.deliveryStatus = "Partially Delivered";
      } else {
        product.deliveryStatus = "Pending";
      }

      const deliveredProduct = delivery.productsDelivered.find(p => p.item_id === dp.item_id);
      if (deliveredProduct) {
        deliveredProduct.deliveredQuantity += dp.deliveredQuantity;
      } else {
        delivery.productsDelivered.push({
          item_id: dp.item_id,
          deliveredQuantity: dp.deliveredQuantity,
        });
      }
    }

    // Recalculate overall delivery status
    await billing.updateDeliveryStatus();

    // Update numeric fields
    if (!isNaN(parseFloat(kmTravelled))) {
      delivery.kmTravelled += parseFloat(kmTravelled);
    }
    if (!isNaN(parseFloat(startingKm))) {
      delivery.startingKm = parseFloat(startingKm);
    }
    if (!isNaN(parseFloat(endKm))) {
      delivery.endKm = parseFloat(endKm);
    }
    if (!isNaN(parseFloat(fuelCharge))) {
      delivery.fuelCharge += parseFloat(fuelCharge);
      billing.fuelCharge = delivery.fuelCharge;
    }

    // Handle Other Expenses (Full CRUD):
    // Existing expenses in this delivery
    const existingExpenseIds = delivery.otherExpenses.map(e => e._id.toString());

    // Expenses from request (otherExpenses) - if _id not present, they're new.
    const updatedExpenseIds = otherExpenses.filter(exp => exp.id).map(exp => exp.id.toString());

    // Determine which expenses to remove (those in existing but not in updated)
    const expensesToRemoveIds = existingExpenseIds.filter(id => !updatedExpenseIds.includes(id));

    // Remove those expenses from delivery and billing
    if (expensesToRemoveIds.length > 0) {
      delivery.otherExpenses = delivery.otherExpenses.filter(e => !expensesToRemoveIds.includes(e._id.toString()));
      billing.otherExpenses = billing.otherExpenses.filter(e => !expensesToRemoveIds.includes(e._id.toString()));
    }

    // Add or update expenses
    for (const expense of otherExpenses) {
      const amt = parseFloat(expense.amount);
      if (isNaN(amt) || amt < 0) {
        throw new Error("Expense amount must be a non-negative number.");
      }

      if (expense.id) {
        // Update existing expense
        const existingExpense = delivery.otherExpenses.find(e => e._id.toString() === expense.id.toString());
        if (!existingExpense) {
          throw new Error(`Expense with id ${expense.id} not found in this delivery.`);
        }
        existingExpense.amount = amt;
        existingExpense.remark = expense.remark || existingExpense.remark;
        if (method && method.trim()) {
          existingExpense.method = method.trim();
        }

        // Also update in billing.otherExpenses
        const billingExpense = billing.otherExpenses.find(e => e._id.toString() === expense.id.toString());
        if (billingExpense) {
          billingExpense.amount = amt;
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
          amount: amt,
          remark: expense.remark || "",
          date: new Date(),
          method: method && method.trim() ? method.trim() : undefined,
        };
        delivery.otherExpenses.push(newExpense);
        billing.otherExpenses.push(newExpense);
      }
    }

    // Determine final delivery status based on products
    const allDelivered = billing.products.every((product) => product.deliveryStatus === "Delivered");
    const anyDelivered = billing.products.some(
      (product) => product.deliveryStatus === "Delivered" || product.deliveryStatus === "Partially Delivered"
    );

    if (allDelivered) {
      delivery.deliveryStatus = "Delivered";
      billing.deliveryStatus = "Delivered";
    } else if (anyDelivered) {
      delivery.deliveryStatus = "Partially Delivered";
      billing.deliveryStatus = "Partially Delivered";
    } else {
      delivery.deliveryStatus = "Pending";
      billing.deliveryStatus = "Pending";
    }

    // If method is provided, update PaymentsAccount
    if (method && method.trim()) {
      const expenseMethod = method.trim();
      const account = await PaymentsAccount.findOne({ accountId: expenseMethod }).session(session);
      if (!account) {
        throw new Error("Payment account not found.");
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
          submittedBy: delivery.userId || userId,
          date: new Date(),
        });
      }

      // Handle Other Expenses
      const currentExpenseRefs = delivery.otherExpenses.map(e => `EXP-${e._id}`);
      // Remove old expense payments not matching current expenses
      account.paymentsOut = account.paymentsOut.filter(pay => {
        if (pay.referenceId.startsWith("EXP-")) {
          return currentExpenseRefs.includes(pay.referenceId);
        }
        return true;
      });

      // Add/update current expenses
      for (const exp of delivery.otherExpenses) {
        if (exp.amount > 0) {
          const expenseRefId = `EXP-${exp._id}`;
          const existingPaymentIndex = account.paymentsOut.findIndex(pay => pay.referenceId === expenseRefId);
          if (existingPaymentIndex >= 0) {
            // Update existing paymentOut
            account.paymentsOut[existingPaymentIndex].amount = exp.amount;
            account.paymentsOut[existingPaymentIndex].method = expenseMethod;
            account.paymentsOut[existingPaymentIndex].remark = `Expense (${exp.remark}) for delivery ${deliveryId}`;
            account.paymentsOut[existingPaymentIndex].submittedBy = delivery.userId || userId;
            account.paymentsOut[existingPaymentIndex].date = new Date();
          } else {
            // Add new paymentOut
            account.paymentsOut.push({
              amount: exp.amount,
              method: expenseMethod,
              referenceId: expenseRefId,
              remark: `Expense (${exp.remark}) for delivery ${deliveryId}`,
              submittedBy: delivery.userId || userId,
              date: new Date(),
            });
          }
        }
      }

      await account.save({ session });
    }

    // Save Billing
    await billing.save({ session });

    // Update Location with end location
    const location = await Location.findOne({ deliveryId }).session(session);
    if (!location) {
      await session.commitTransaction();
      session.endSession();
      return res.status(404).json({ error: "Location not found for this deliveryId." });
    }

    location.endLocations.push({
      coordinates: endLocation,
      timestamp: new Date(),
    });

    await location.save({ session });

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({ message: "Delivery completed and statuses updated.", delivery });
  } catch (error) {
    console.error("Error processing end-delivery request:", error);
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();
    res.status(500).json({ error: error.message || "Failed to complete delivery and update statuses." });
  }
});






// =========================
// Route: Update Payment for a Billing Entry
// =========================
userRouter.post("/billing/update-payment", async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { invoiceNo, paymentAmount, paymentMethod, userId } = req.body;

    // Validate required fields
    if (!invoiceNo || !paymentAmount || !paymentMethod || !userId) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: "All fields are required." });
    }

    // Find the billing record
    const billing = await Billing.findOne({ invoiceNo: invoiceNo.trim() }).session(session);
    if (!billing) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: "Billing not found" });
    }

    // Find the user
    const user = await User.findById(userId).session(session);
    if (!user) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ error: "User not found." });
    }

    const parsedPaymentAmount = parseFloat(paymentAmount);
    if (isNaN(parsedPaymentAmount) || parsedPaymentAmount <= 0) {
      await session.abortTransaction();
      session.endSession();
      return res.status(400).json({ error: "Invalid payment amount." });
    }

    const referenceId = "PAY" + Date.now().toString();
    const currentDate = new Date();

    // Create payment entries
    const paymentEntry = {
      amount: parsedPaymentAmount,
      method: paymentMethod.trim(),
      date: currentDate,
      referenceId: referenceId,
      invoiceNo: invoiceNo.trim(),
    };

    const accountPaymentEntry = {
      amount: parsedPaymentAmount,
      method: paymentMethod.trim(),
      referenceId: referenceId,
      remark: `Bill ${invoiceNo.trim()}`,
      submittedBy: userId,
      date: currentDate,
    };

    const customerPaymentEntry = {
      amount: parsedPaymentAmount,
      method: paymentMethod.trim(),
      remark: `Bill ${invoiceNo.trim()}`,
      submittedBy: userId,
      date: currentDate,
      referenceId: referenceId,
      invoiceNo: invoiceNo.trim(),
    };

    // Update PaymentsAccount
    const account = await PaymentsAccount.findOne({ accountId: paymentMethod.trim() }).session(session);
    if (!account) {
      await session.abortTransaction();
      session.endSession();
      return res.status(404).json({ message: 'Payment account not found' });
    }

    account.paymentsIn.push(accountPaymentEntry);
    await account.save({ session });

    // Add the new payment to billing
    billing.payments.push(paymentEntry);

    // Recalculate the total payments received
    billing.billingAmountReceived = billing.payments.reduce(
      (total, payment) => total + (payment.amount || 0),
      0
    );

    // Calculate net amount after discount
    const netAmount = billing.grandTotal || 0;

    // Update the payment status based on the total amount received vs net amount
    if (billing.billingAmountReceived >= netAmount) {
      billing.paymentStatus = "Paid";
    } else if (billing.billingAmountReceived > 0) {
      billing.paymentStatus = "Partial";
    } else {
      billing.paymentStatus = "Unpaid";
    }

    await billing.save({ session });

    // Update CustomerAccount
    let customerAccount = await CustomerAccount.findOne({ customerId: billing.customerId.trim() }).session(session);
    if (!customerAccount) {
      // Create new customer account if not found
      customerAccount = new CustomerAccount({
        customerId: billing.customerId.trim(),
        customerName: billing.customerName.trim(),
        customerAddress: billing.customerAddress.trim(),
        customerContactNumber: billing.customerContactNumber.trim(),
        bills: [],
        payments: [],
      });
    }

    customerAccount.payments.push(customerPaymentEntry);

    // Recalculate totalBillAmount, paidAmount, pendingAmount
    customerAccount.totalBillAmount = customerAccount.bills.reduce(
      (acc, bill) => acc + (bill.billAmount || 0),
      0
    );
    customerAccount.paidAmount = customerAccount.payments.reduce(
      (acc, payment) => acc + (payment.amount || 0),
      0
    );
    customerAccount.pendingAmount = customerAccount.totalBillAmount - customerAccount.paidAmount;

    await customerAccount.save({ session });

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      message: "Payment updated successfully.",
      paymentStatus: billing.paymentStatus,
    });
  } catch (error) {
    console.error("Error updating payment:", error);

    // Abort transaction on error
    if (session.inTransaction()) {
      await session.abortTransaction();
    }
    session.endSession();

    res.status(500).json({ error: error.message || "Failed to update payment." });
  }
});




// Update the route to fetch all locations for a given invoice number
userRouter.get('/locations/invoice/:invoiceNo', async (req, res) => {
  try {
    const invoiceNo = req.params.invoiceNo;

    console.log(invoiceNo);
    // Fetch all location documents related to the invoice number
    const locations = await Location.find({ invoiceNo });

    if (!locations || locations.length === 0) {
      return res.status(404).json({ message: 'No locations found for this invoice' });
    }

    res.json(locations);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error fetching locations' });
  }
});



userRouter.get('/allusers/all', async (req, res) =>{
  try{
      const allUsers = await User.find()
      res.status(200).json(allUsers)
  }catch (error){
      res.status(500).json({message: "Error Fetching"})
  }
});

userRouter.get('/salesmen/all', async (req, res) => {
  try{
      const allUsers = await User.find()
      res.status(200).json(allUsers)
  }catch (error){
      res.status(500).json({message: "Error Fetching"})
  }
});


userRouter.get('/alllogs/all', async (req,res)=>{
  try{
      const allLogs = await Log.find().sort({createdAt: -1})
      res.status(200).json(allLogs)
  }catch (error){
      res.status(500).json({message: "Error Fetching"})
  }
})

userRouter.post('/alllogs/all', async (req,res)=>{
  try{
      const allLogs = await Log.deleteMany()
      res.status(200).json(allLogs)
  }catch (error){
      res.status(500).json({message: "Error Fetching"})
  }
});

userRouter.get('/all/deliveries', async (req, res) => {
  try {
    const deliveries = await Location.find({});
    res.json(deliveries);
  } catch (error) {
    console.error('Error fetching deliveries:', error);
    res.status(500).json({ message: 'Error fetching deliveries' });
  }
});


userRouter.get('/driver/getPSratio/:id', async (req, res) => {
  try {
    const product = await Product.findOne({ item_id: req.params.id });
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    if (product.psRatio === undefined || product.psRatio === null || isNaN(parseFloat(product.psRatio))) {
      return res.status(400).json({ message: 'Invalid PS Ratio for this product' });
    }

    const psRatio = parseFloat(product.psRatio);
    return res.status(200).json({ psRatio });
  } catch (error) {
    console.error('Error fetching PS ratio:', error);
    return res.status(500).json({ message: 'Error fetching PS Ratio' });
  }
});






export default userRouter;
