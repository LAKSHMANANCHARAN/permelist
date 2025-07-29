import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import bcrypt, { hash } from "bcrypt";



const app=express();
app.use(express.static("public")); // if style.css is in public/

const db = new pg.Client({
  user: "postgres",
  host: "localhost",
  database: "authentication",
  password: "Lakshmanan@1",
  port: 5432,
});
db.connect();
app.use(bodyParser.urlencoded({extended:true}));



app.get("/",(req,res)=>{
    res.render("index.ejs")
});


app.get("/register",(req,res)=>{
    res.render("register.ejs")
});


app.get("/login",(req,res)=>{
    res.render("signup.ejs")
});


app.post("/register",async(req,res)=>{
    const user=req.body.username;
    const password=req.body.password;
    try{
        const checkresult=await db.query("select * from details where name=($1)",[user]);
        if (checkresult.rows.length>0){
            res.send("this email is already available");
        }
        else{
            bcrypt.hash(password,10,async(err,hash)=>{
                if(err){
                    console.log(err)
                }
                else{
                    db.query("insert into details(name,password)values($1,$2)",[user,hash])
                    res.render("signup.ejs")
                }
            })
        }
    }
    catch(err){
        console.log(err)

    }
})




app.post("/signup",async(req,res)=>{
    const usern=req.body.username;
    const password=req.body.password;

    try{
        const check=await db.query("select * from details where name=($1)",[usern]);
        if(check.rows.length>0){
            const user = check.rows[0];
            const storedPassword = user.password;
            bcrypt.compare(password,storedPassword,async(err,result)=>{
                if(err){
                    console.log(err);
                }
                else{
                    if(result){
                    const hobbyResult = await db.query("SELECT hobbies FROM details WHERE name = $1", [usern]);
                    const hobby = hobbyResult.rows.length > 0 ? hobbyResult.rows[0].hobbies : [];
                    res.render("home.ejs", { name: usern, hobby: hobby });
                    }
                    else{
                        res.send("wrong password")
                    }
                }
            })
        }
        else{
            res.send("user name not exist")
        }
    }
    catch(err){
        console.log(err)
    }
})



app.post("/add",async(req,res)=>{
    const task=req.body.task;
    const user = req.body.user;
    const result =  await db.query(
"UPDATE details SET hobbies = array_append(hobbies, $1) WHERE name = $2",
  [task, user]
)
    const hobbyResult = await db.query("SELECT hobbies FROM details WHERE name = $1", [user]);
    const hobby = hobbyResult.rows.length > 0 ? hobbyResult.rows[0].hobbies : [];
    res.render("home.ejs", { name: user, hobby: hobby });
})
app.post("/delete",async(req,res)=>{
    const task=req.body.task;
    const user=req.body.user;
    await db.query("UPDATE details SET hobbies = array_remove(hobbies, $1) WHERE name = $2",[task,user]);
    const hobbyResult = await db.query("SELECT hobbies FROM details WHERE name = $1", [user]);
    const hobby = hobbyResult.rows.length > 0 ? hobbyResult.rows[0].hobbies : [];
    res.render("home.ejs", { name: user, hobby: hobby });
})

app.post("/edit",async(req,res)=>{
    const user=req.body.user;
    const existing = req.body.oldtask;
    const newtask = req.body.newtask;

        await db.query(
        "UPDATE details SET hobbies = array_replace(hobbies, $1, $2) WHERE name = $3",
        [existing, newtask, user]
    );

    const hobbyResult = await db.query("SELECT hobbies FROM details WHERE name = $1", [user]);
    const hobby = hobbyResult.rows.length > 0 ? hobbyResult.rows[0].hobbies : [];
    res.render("home.ejs", { name: user, hobby: hobby });
})

app.listen(3000,(req,res)=>{
    console.log("listing")
})