import Joi from "joi";
export const validate = (schema) => (req,res,next)=>{
  const data = { body:req.body, params:req.params, query:req.query };
  const { error } = schema.validate(data, { abortEarly:false, allowUnknown:true });
  if (error) return next({ status:400, message: error.details.map(d=>d.message).join(", ") });
  next();
};
