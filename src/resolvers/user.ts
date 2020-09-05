import {
  Resolver,
  Mutation,
  Arg,
  Field,
  Ctx,
  ObjectType,
  Query,
} from "type-graphql";
import { MyContext } from "src/types";
import { User } from "../entities/User";
import {
  COOKIE_NAME,
  FORGET_PASSWORD_PREFIX as FORGOT_PASSWORD_PREFIX,
} from "../constants";
import { UsernamePasswordInput } from "./UsernamePasswordInput";
import { validateRegister } from "../utils/vaidateRegister";
import { sendEmail } from "../utils/sendEmail";
import { v4 } from "uuid";
@ObjectType()
class FieldError {
  @Field()
  field: string;

  @Field()
  message: string;
}

@ObjectType()
class UserResponse {
  @Field(() => [FieldError], { nullable: true })
  errors?: FieldError[];

  @Field(() => User, { nullable: true })
  user?: User;
}

@Resolver()
export class UserResolver {
  @Mutation(() => UserResponse)
  async changePassword(
    @Arg("token") token: string,
    @Arg("newPassword") newPassword: string,
    @Ctx() ctx: MyContext
  ): Promise<UserResponse> {
    if (newPassword.length < 3) {
      return {
        errors: [
          {
            field: "newPassword",
            message: "length must be greater than 3",
          },
        ],
      };
    }

    const key = FORGOT_PASSWORD_PREFIX + token;
    const userId = await ctx.redis.get(key);
    if (!userId) {
      return {
        errors: [
          {
            field: "token",
            message: "token expired",
          },
        ],
      };
    }

    const user = await ctx.em.findOne(User, { id: parseInt(userId) });

    if (!user) {
      return {
        errors: [
          {
            field: "token",
            message: "user no longer exists",
          },
        ],
      };
    }

    user.password = newPassword;
    await ctx.em.persistAndFlush(user);

    await ctx.redis.del(key);

    // login user after change password
    ctx.req.session.userId = user.id;

    return { user };
  }

  @Mutation(() => Boolean)
  async forgotPassword(@Arg("email") email: string, @Ctx() ctx: MyContext) {
    const user = await ctx.em.findOne(User, { email });
    if (!user) {
      // the email is not in the db
      return true;
    }

    const token = v4();

    await ctx.redis.set(
      FORGOT_PASSWORD_PREFIX + token,
      user.id,
      "ex",
      1000 * 60 * 60 * 24 * 3 // 3 days
    );

    await sendEmail(
      email,
      `<a href="http://localhost:3000/change-password/${token}">reset password</a>`
    );
    return true;
  }
  @Query(() => User, { nullable: true })
  async me(@Ctx() ctx: MyContext) {
    console.log("session: ", ctx.req.session);

    // not logged in
    if (!ctx.req.session.userId) {
      return null;
    }

    const user = await ctx.em.findOne(User, { id: ctx.req.session.userId });
    return user;
  }

  @Mutation(() => UserResponse)
  async register(
    @Arg("options") options: UsernamePasswordInput,
    @Ctx() ctx: MyContext
  ): Promise<UserResponse> {
    // const hashedPassword = await argon2.hash(options.password);
    const errors = validateRegister(options);
    if (errors) {
      return { errors };
    }

    const user = ctx.em.create(User, {
      username: options.username,
      email: options.email,
      password: options.password,
    });
    try {
      await ctx.em.persistAndFlush(user);
    } catch (error) {
      // duplicate username error
      if (error.code === "23505" || error.detail?.includes("already exists")) {
        return {
          errors: [
            {
              field: "username",
              message: "username already taken",
            },
          ],
        };
      }
    }

    // store user id session
    // this will set a cookie on the user
    // keep them logged in
    ctx.req.session.userId = user.id;

    return { user };
  }

  @Mutation(() => UserResponse)
  async login(
    @Arg("usernameOrEmail") usernameOrEmail: string,
    @Arg("password") password: string,
    @Ctx() ctx: MyContext
  ): Promise<UserResponse> {
    const user = await ctx.em.findOne(
      User,
      usernameOrEmail.includes("@")
        ? { email: usernameOrEmail }
        : { username: usernameOrEmail }
    );
    if (!user) {
      return {
        errors: [
          {
            field: "usernameOrEmail",
            message: "that username doesn't exist",
          },
        ],
      };
    }

    // const valid = await argon2.verify(user.password, options.password);
    const valid = user.password === password;

    if (!valid) {
      return {
        errors: [
          {
            field: "password",
            message: "incorrect password",
          },
        ],
      };
    }

    ctx.req.session.userId = user.id;

    return { user };
  }

  @Mutation(() => Boolean)
  logout(@Ctx() ctx: MyContext) {
    return new Promise((res) =>
      ctx.req.session.destroy((err) => {
        ctx.res.clearCookie(COOKIE_NAME);
        if (err) {
          console.error("err: ", err);
          res(false);
          return;
        }

        res(true);
      })
    );
  }
}
