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
import { COOKIE_NAME } from "../constants";
import { UsernamePasswordInput } from "./UsernamePasswordInput";
import { validateRegister } from "../utils/vaidateRegister";
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
  @Mutation(() => Boolean)
  async forgotPassword(
    @Arg("email") email: string,
    @Ctx() ctx: MyContext,
  ) {
    // const user = await ctx.em.findOne(User, {email})
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
    @Ctx() ctx: MyContext,
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
    @Ctx() ctx: MyContext,
  ): Promise<UserResponse> {
    const user = await ctx.em.findOne(
      User,
      usernameOrEmail.includes("@")
        ? { email: usernameOrEmail }
        : { username: usernameOrEmail },
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
