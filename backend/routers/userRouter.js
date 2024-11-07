import express from 'express';
import expressAsyncHandler from 'express-async-handler';
import bcrypt from 'bcryptjs';
import data from '../data.js';
import User from '../models/userModel.js';
import { generateToken, isAdmin, isAuth } from '../utils.js';
import AttendenceModel from '../models/attendenceModel.js';
import Location from '../models/locationModel.js'
import Billing from '../models/billingModal.js';
import Return from '../models/returnModal.js';
import Product from '../models/productModel.js';
import Purchase from '../models/purchasemodals.js';
import Damage from '../models/damageModal.js';
import Log from '../models/Logmodal.js';

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
    const user = await User.findById(req.user._id);
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


// Update the start location
userRouter.post("/billing/start-delivery", async (req, res) => {
  try {
    const { userId, driverName, invoiceNo, startLocation } = req.body;

    // Ensure all required fields are present
    if (!userId || !driverName || !invoiceNo || !startLocation) {
      return res.status(400).json({ error: "All fields are required." });
    }


    // Update or create a location document with userId, driverName, and startLocation
    const location = await Location.findOneAndUpdate(
      { userId }, // Match based on userId
      {
        $set: {
          driverName, 
          startLocation, 
          invoiceNo, // Optionally update the invoice number
        }
      },
      { upsert: true, new: true } // Create a new document if it doesn't exist
    );

    if (!location) {
      return res.status(500).json({ error: "Failed to update or create location." });
    }

    // Update the billing delivery status
    const billing = await Billing.findOneAndUpdate(
      { invoiceNo },
      { $set: { deliveryStatus: "Transit-In" } },
      { new: true } // Return the updated document
    );

    if (!billing) {
      return res.status(404).json({ error: "Billing not found" });
    }

    res.status(200).json({
      message: "Start location and delivery status updated successfully.",
      location,
    });
  } catch (error) {
    console.error("Error saving start location and updating delivery status:", error);
    res.status(500).json({ error: "Failed to save start location and update delivery status." });
  }

});




// Update the end location and mark as delivered
userRouter.post("/billing/end-delivery", async (req, res) => {
  try {
    const { 
      userId, 
      invoiceNo, 
      endLocation, 
      deliveredProducts = [], 
      deliveryStatus, 
      paymentStatus, 
      kmTravelled = 0, 
      fuelCharge = 0, 
      otherExpenses = [], 
      startingKm = 0, 
      endKm = 0 
    } = req.body;

    // Validate required fields
    if (!userId || !invoiceNo || !endLocation) {
      return res.status(400).json({ error: "userId, invoiceNo, and endLocation are required." });
    }

    // Calculate totalOtherExpenses, including only expenses with a valid amount > 0
    const validOtherExpenses = Array.isArray(otherExpenses) 
      ? otherExpenses.filter(expense => 
          typeof expense === "object" && 
          expense !== null && 
          typeof expense.amount === "number" && 
          expense.amount > 0
        )
      : [];

    const totalOtherExpenses = validOtherExpenses.reduce((sum, expense) => sum + expense.amount, 0);

    // Find and update the location with the new end location
    const location = await Location.findOneAndUpdate(
      { userId },
      {
        $set: {
          endLocation,
          invoiceNo,
          deliveryStatus,
          paymentStatus
        },
      },
      { upsert: true, new: true }
    );

    if (!location) {
      return res.status(500).json({ error: "Failed to update or create location." });
    }

    // Find the billing entry by invoice number
    const billing = await Billing.findOne({ invoiceNo });
    if (!billing) {
      return res.status(404).json({ error: "Billing not found" });
    }

    // Update numeric fields with parsed values
    billing.kmTravelled = (parseFloat(billing.kmTravelled)) + parseFloat(kmTravelled || 0);
    billing.startingKm = parseFloat(startingKm) || parseFloat(billing.startingKm || 0);
    billing.endKm = parseFloat(endKm) || parseFloat(billing.endKm || 0);
    billing.fuelCharge = (parseFloat(billing.fuelCharge) || 0) + parseFloat(fuelCharge || 0);

    // Append only valid otherExpenses entries to billing
    if (validOtherExpenses.length > 0) {
      billing.otherExpenses.push(...validOtherExpenses.map(expense => ({
        amount: parseFloat(expense.amount),
        remark: expense.remark || ""
      })));
    }

    // Update the delivery status for each product
    billing.products.forEach((product) => {
      product.deliveryStatus = deliveredProducts.includes(product.item_id) ? "Delivered" : "Pending";
    });

    // Check if all products have been delivered to update overall delivery status
    const allDelivered = billing.products.every((product) => product.deliveryStatus === "Delivered");
    billing.deliveryStatus = allDelivered ? "Delivered" : "Pending";

    // Update payment status if provided
    if (paymentStatus) {
      billing.paymentStatus = paymentStatus;
    }

    // Save the updated billing
    await billing.save();

    res.status(200).json({ message: "Delivery completed and statuses updated." });
  } catch (error) {
    console.error("Error processing end-delivery request:", error);
    res.status(500).json({ error: "Failed to complete delivery and update statuses." });
  }
});





userRouter.post("/billing/update-payment", async (req, res) => {
  try {
    const { invoiceNo, paymentAmount, paymentMethod, paymentStatus } = req.body;

    // Find the billing record
    const billing = await Billing.findOne({ invoiceNo });
    if (!billing) {
      return res.status(404).json({ error: "Billing not found" });
    }

    // Add the new payment to the payments array
    billing.payments.push({
      amount: paymentAmount,
      method: paymentMethod,
    });

    // Calculate the total payments received
    const totalPaymentsReceived = billing.payments.reduce((total, payment) => total + payment.amount, 0);

    // Update payment status based on total payments
    if (totalPaymentsReceived >= billing.billingAmount) {
      billing.paymentStatus = "Paid";
    } else if (totalPaymentsReceived > 0) {
      billing.paymentStatus = "Partial";
    } else {
      billing.paymentStatus = "Pending";
    }

    await billing.save();

    res.status(200).json({ message: "Payment updated successfully.", paymentStatus: billing.paymentStatus });
  } catch (error) {
    console.error("Error updating payment:", error);
    res.status(500).json({ error: "Failed to update payment." });
  }
});



// API endpoint to fetch locations by invoice number
userRouter.get('/locations/invoice/:invoiceNo', async (req, res) => {
  try {
    const invoiceNo = req.params.invoiceNo;

    console.log(invoiceNo);
    // Fetch all locations related to the invoice number
    const locations = await Location.findOne({ invoiceNo });

    if (!locations) {
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
})





export default userRouter;
