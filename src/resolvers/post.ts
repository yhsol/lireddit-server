import { Resolver, Query, Ctx } from "type-graphql";
import { MyContext } from "src/types";
import { Post } from "src/entities/Post";

@Resolver()
export class PostResolver {
  @Query(() => [Post])
  posts(@Ctx() ctx: MyContext): Promise<Post[]> {
    return ctx.em.find(Post, {});
  }
}
