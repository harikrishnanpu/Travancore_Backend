import express from 'express';
import expressAsyncHandler from 'express-async-handler';
import bcrypt from 'bcryptjs';
import data from '../data.js';
import User from '../models/userModel.js';
import { generateToken, isAdmin, isAuth } from '../utils.js';
import AttendenceModel from '../models/attendenceModel.js';
import faceapi from 'face-api.js'

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
    }else {
    if(user.faceDescriptor){

      return res.status(200).json(user)

    }else{
      return res.status(404).json({ message: 'User not found' });
    }
  }
  }catch (error){
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



export default userRouter;
