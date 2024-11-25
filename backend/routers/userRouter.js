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
import PaymentsAccount from '../models/paymentsAccountModal.js';

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
    } = req.body;

    // Validate required fields
    if (!userId || !invoiceNo || !endLocation || !deliveryId) {
      return res.status(400).json({ error: "userId, invoiceNo, endLocation, and deliveryId are required." });
    }

    // Validate deliveredProducts format
    if (!Array.isArray(deliveredProducts) || deliveredProducts.length === 0) {
      return res.status(400).json({ error: "deliveredProducts must be a non-empty array." });
    }

    // Find the Billing document by invoiceNo
    const billing = await Billing.findOne({ invoiceNo });
    if (!billing) {
      return res.status(404).json({ error: "Billing not found." });
    }

    // Find the corresponding delivery entry
    const delivery = billing.deliveries.find(d => d.deliveryId === deliveryId);
    if (!delivery) {
      return res.status(404).json({ error: "Delivery not found for this deliveryId." });
    }

    // Update deliveredQuantity and deliveryStatus for each product
    deliveredProducts.forEach((dp) => {
      const product = billing.products.find((p) => p.item_id === dp.item_id);
      if (product) {
        // Calculate the new total delivered quantity
        const previousDeliveredQuantity = product.deliveredQuantity || 0;
        const totalDeliveredQuantity = previousDeliveredQuantity + dp.deliveredQuantity;

        // Ensure totalDeliveredQuantity does not exceed the ordered quantity
        if (totalDeliveredQuantity >= product.quantity) {
          product.deliveredQuantity = product.quantity;
          product.deliveryStatus = "Delivered";
        } else if (totalDeliveredQuantity > 0) {
          product.deliveredQuantity = totalDeliveredQuantity;
          product.deliveryStatus = "Partially Delivered";
        } else {
          product.deliveredQuantity = previousDeliveredQuantity;
          product.deliveryStatus = "Pending";
        }

        // Update the delivery's productsDelivered
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
    });

    // Recalculate overall delivery status
    await billing.updateDeliveryStatus();

    // Update numeric fields with parsed values
    delivery.kmTravelled += parseFloat(kmTravelled) || 0;
    delivery.startingKm = parseFloat(startingKm) || delivery.startingKm;
    delivery.endKm = parseFloat(endKm) || delivery.endKm;
    delivery.fuelCharge += parseFloat(fuelCharge) || 0;

    // Process otherExpenses
    if (Array.isArray(otherExpenses) && otherExpenses.length > 0) {
      const validOtherExpenses = otherExpenses.filter(
        (expense) =>
          typeof expense === "object" &&
          expense !== null &&
          typeof expense.amount === "number" &&
          expense.amount > 0
      );

      if (validOtherExpenses.length > 0) {
        delivery.otherExpenses.push(
          ...validOtherExpenses.map((expense) => ({
            amount: parseFloat(expense.amount),
            remark: expense.remark || "",
            date: new Date(),
          }))
        );

        billing.otherExpenses.push(
          ...validOtherExpenses.map((expense) => ({
            amount: parseFloat(expense.amount),
            remark: expense.remark || "",
            date: new Date(),
          }))
        );
      }
    }

    // Update the delivery status based on products delivered
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

    // Save the updated Billing document
    await billing.save();

    // Update the Location document with the new end location
    const location = await Location.findOne({ deliveryId });

    if (!location) {
      return res.status(404).json({ error: "Location not found for this deliveryId." });
    }

    // Add the end location to the endLocations array
    location.endLocations.push({
      coordinates: endLocation,
      timestamp: new Date(),
    });

    await location.save();

    res.status(200).json({ message: "Delivery completed and statuses updated.", delivery });

  } catch (error) {
    console.error("Error processing end-delivery request:", error);
    res.status(500).json({ error: "Failed to complete delivery and update statuses." });
  }
});






userRouter.post("/billing/update-payment", async (req, res) => {
  try {
    const { invoiceNo, paymentAmount, paymentMethod, userId } = req.body;

    // Validate required fields
    if (!invoiceNo || !paymentAmount || !paymentMethod) {
      return res.status(400).json({ error: "All fields are required." });
    }

    // Find the billing record
    const billing = await Billing.findOne({ invoiceNo });
    if (!billing) {
      return res.status(404).json({ error: "Billing not found" });
    }

    const parsedPaymentAmount = parseFloat(paymentAmount).toFixed(2);

    const accountPaymentEntry = {
      amount: parsedPaymentAmount,
      method: paymentMethod,
      remark: `Bill ${invoiceNo}`,
      submittedBy: userId,
    };
  
    try {
      const account = await PaymentsAccount.findOne({ accountId: paymentMethod });
    
      if (!account) {
        console.log(`No account found for accountId: ${paymentMethod}`);
        return res.status(404).json({ message: 'Payment account not found' });
      }
    
      account.paymentsIn.push(accountPaymentEntry);
    
      await account.save();
    } catch (error) {
      console.error('Error processing payment:', error);
      return res.status(500).json({ message: 'Error processing payment', error });
    }

    // Add the new payment using the model's method
    await billing.addPayment(paymentAmount, paymentMethod);

    res.status(200).json({ message: "Payment updated successfully.", paymentStatus: billing.paymentStatus });
  } catch (error) {
    console.error("Error updating payment:", error);
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
